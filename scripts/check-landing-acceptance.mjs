// Local, offline route and hydrated-browser verification. Uses a fresh Chromium
// profile and synthetic pending metadata only; never signs or submits anything.
// Run after npm run build and next start on a separate local port:
// node scripts/check-landing-acceptance.mjs [http://127.0.0.1:3107] [/tmp/yawrd-landing-review]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ATTEMPT_KEY, prepareCreation } from '../src/creation-integration.ts';

const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:3107').origin;
assert.ok(['http://127.0.0.1:3107', 'http://localhost:3107'].includes(origin), 'Use the isolated local preview port');
const directory = resolve(process.argv[3] ?? '/tmp/yawrd-landing-review');
const results = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function passed(check) { results.push(check); console.log(`Passed: ${check}`); }

async function http(path, status = 200) {
  const response = await fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, status, path);
  return response;
}
await mkdir(directory, { recursive: true });
for (const query of [
  '?transactionHashes=abc&accountId=alice.testnet&wallet=meteor',
  '?before=1&transactionHashes=abc%2Cdef&repeat=one&repeat=two&empty=&note=a%20b%2Bc&errorMessage=User%20rejected',
  '?transactionHashes=&errorCode=UserRejected',
]) {
  const response = await http('/' + query, 307);
  const target = new URL(response.headers.get('location'), origin);
  assert.equal(target.origin, origin);
  assert.equal(target.pathname, '/create');
  assert.deepEqual([...target.searchParams], [...new URLSearchParams(query)], 'Preserve all query values, repeated keys and empty parameters');
  assert.equal((await http('/create' + query)).headers.get('location'), null);
}
passed('legacy wallet returns preserve the full query and do not loop');
for (const path of ['/', '/?campaign=launch', '/?errorCode=UserRejected', '/create', '/create?transactionHashes=abc']) {
  const response = await http(path);
  const html = await response.text();
  assert.ok((path.startsWith('/create') ? html.replace(/<[^>]*>/g, '').includes('Create your Yawrd') : html.includes('The place to <span>build</span>')));
  assert.ok(html.includes(path.startsWith('/create') ? '<title>Open a Yawrd · Testnet</title>' : '<title>Yawrd · The place to build</title>'));
  assert.equal((html.match(/<link rel="icon" /g) ?? []).length, 1, `${path} has one favicon declaration`);
  assert.ok(html.includes('<link rel="icon" href="/brand/android-chrome-192x192.png" type="image/png" sizes="192x192"/>'));
}
await http('/icon.svg', 404);
assert.ok((await (await http('/yawrd/the-common-table')).text()).includes('Public preview'));
assert.ok((await (await http('/docs')).text()).includes('Back to Yawrd'));
passed('landing, builder, fixture and route-specific metadata render');

function luminance(hex) {
  const rgb = hex.match(/../g).map(x => parseInt(x, 16) / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
for (const [fg, bg] of [['f2f7f5','001819'], ['60e3d5','001819'], ['c4dce4','001819'], ['b4cccb','001819'], ['7df3e5','002021'], ['bed1d9','002021'], ['8fe5d9','001718'], ['c5d7df','001718'], ['c1d3db','001819'], ['002026','a9f1e9']]) {
  const ratio = (Math.max(luminance(fg), luminance(bg)) + .05) / (Math.min(luminance(fg), luminance(bg)) + .05);
  assert.ok(ratio >= 4.5, `Palette contrast ${fg}/${bg}: ${ratio}`);
}
passed('landing text and button palette meets WCAG AA contrast (4.5:1)');

const profile = await mkdtemp(join(tmpdir(), 'yawrd-landing-browser-'));
let browser, ws;
try {
  browser = spawn('chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await pause(100); }
  }
  assert.ok(port, 'Chromium must start');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
  await once(ws, 'open');
  let sequence = 0;
  const pending = new Map();
  const pageErrors = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') pageErrors.push(message.params.exceptionDetails.text);
    const waiter = pending.get(message.id);
    if (waiter) { pending.delete(message.id); waiter(message); }
  });
  async function cdp(method, params = {}) {
    const id = ++sequence;
    let timer;
    try {
      const response = new Promise((resolve, reject) => {
        pending.set(id, resolve);
        timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 15000);
      });
      ws.send(JSON.stringify({ id, method, params }));
      const message = await response;
      assert.equal(message.error, undefined, method);
      return message.result;
    } finally { clearTimeout(timer); }
  }
  async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, expression);
    return result.result.value;
  }
  async function until(expression) {
    for (let i = 0; i < 150; i++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await pause(100);
    }
    assert.fail(`Browser condition did not pass: ${expression}`);
  }
  await cdp('Page.enable');
  await cdp('Runtime.enable');
  await cdp('Network.enable');
  await cdp('Network.setBlockedURLs', { urls: ['https://*'] });
  async function navigate(path, width, height = 1000, reduced = false) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] });
    await cdp('Page.navigate', { url: origin + path });
    await until(`document.readyState === 'complete' && location.pathname === ${JSON.stringify(path.split('?')[0])} && document.querySelector('h1') !== null`);
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, `${path} at ${width}px must not overflow`);
  }
  async function screenshot(name, full = true) {
    const layout = await cdp('Page.getLayoutMetrics');
    const size = layout.cssContentSize;
    const shot = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(full ? { clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 } } : {}) });
    await writeFile(join(directory, name + '.png'), Buffer.from(shot.data, 'base64'));
  }
  for (const width of [1672, 1440, 1280, 1100, 1024, 768, 640, 390, 320]) {
    await navigate('/', width, width < 500 ? 844 : 1000);
    assert.equal(await evaluate(`document.querySelector('.landing-wordmark').textContent`), 'Yawrd.');
    assert.equal(await evaluate(`document.querySelector('h1').textContent`), 'The place to build');
    assert.equal(await evaluate(`document.querySelector('.landing-subtitle').textContent`), "Where People & Agents collab on what's next.");
    assert.equal(await evaluate(`document.querySelector('meta[name="description"]').content`), "Where People & Agents collab on what's next.");
    assert.equal(await evaluate(`document.querySelector('.landing-wallet-note').textContent`), 'Tag us on Near Social for early access');
    assert.equal(await evaluate(`document.querySelector('.landing-wallet-note a').textContent`), 'Near Social');
    assert.equal(await evaluate(`document.querySelector('.landing-wallet-note a').href`), 'https://near.social/yawrd.near');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.landing-wallet-note a')).textDecorationLine`), 'underline');
    assert.equal(await evaluate(`document.body.innerText.includes('Opening on Testnet requires wallet approval and setup costs.')`), false);
    assert.equal(await evaluate(`document.querySelector('.landing-journey-heading .landing-eyebrow').textContent`), 'From Blueprint to Build');
    assert.equal(await evaluate(`document.querySelector('#journey-title').textContent`), 'Made together.');
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('.landing-steps li')].map(el => [el.querySelector('.landing-step-number span').textContent, el.querySelector('h3').textContent, el.querySelector('p').textContent])`), [
      ['01', 'Open', 'Describe the Yawrd, the build, and the rules.'],
      ['02', 'Recruit', 'Invite people and agents into your Yawrd.'],
      ['03', 'Build', 'Work together toward a shared goal.'],
      ['04', 'Reward', 'Fund contributors transparently.'],
    ]);
    assert.equal(await evaluate(`document.querySelectorAll('link[rel="icon"]').length`), 1, 'Only one favicon is configured');
    assert.equal(await evaluate(`document.querySelector('link[rel="icon"]').getAttribute('href')`), '/brand/android-chrome-192x192.png');
    assert.equal(await evaluate(`document.querySelector('link[rel="icon"]').type`), 'image/png');
    assert.equal(await evaluate(`document.querySelector('link[rel="icon"]').sizes.value`), '192x192');
    const icon = await http(await evaluate(`document.querySelector('link[rel="icon"]').getAttribute('href')`));
    assert.equal(icon.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await icon.arrayBuffer()), await readFile(new URL('../public/brand/android-chrome-192x192.png', import.meta.url)), 'The supplied favicon is served without alterations');
    assert.deepEqual(await evaluate(`(async () => { const img = new Image(); img.src = document.querySelector('link[rel="icon"]').href; await img.decode(); return [img.naturalWidth, img.naturalHeight]; })()`), [192, 192]);
    assert.equal(await evaluate(`document.querySelectorAll('.landing-features li').length`), 5);
    assert.equal(await evaluate(`document.querySelector('.landing-planned').textContent`), 'Planned functionality');
    assert.equal(await evaluate(`document.querySelector('.landing-github').href`), `${origin}/yawrd/yaw-001`);
    assert.equal(await evaluate(`document.querySelectorAll('a').length`), 8);
    assert.equal(await evaluate(`document.querySelector('.landing-footer a[href="/docs"]').textContent`), 'Docs');
    assert.equal(await evaluate(`[...document.images].every(img => img.complete && img.naturalWidth > 0)`), true);
    // Inline prose links are exempt from the 24px target size; retain the check for every existing navigation link.
    assert.equal(await evaluate(`[...document.querySelectorAll('a')].filter(el => !el.closest('.landing-wallet-note')).every(el => {const r = el.getBoundingClientRect(); return r.width >= 24 && r.height >= 24})`), true);
    assert.equal(await evaluate(`document.querySelector('.landing-primary').getAttribute('href')`), '/create');
    assert.equal(await evaluate(`document.querySelector('.landing-secondary').getAttribute('href')`), '/#discover');
    if ([1672, 1440, 1024, 768, 640, 390, 320].includes(width)) await screenshot(`landing-${width}`);
    passed(`landing ${width}px: approved content, planned labels, loaded assets, working CTAs, no overflow`);
  }
  await navigate('/', 1440);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate(`document.activeElement.className`), 'landing-skip');
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await until(`document.activeElement.id === 'main-content'`);
  await evaluate(`document.querySelector('.landing-secondary').focus()`);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate(`document.activeElement.href`), 'https://near.social/yawrd.near');
  assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineStyle`), 'solid');
  assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineWidth`), '2px');
  await evaluate(`document.querySelector('.landing-primary').focus()`);
  assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineStyle`), 'solid');
  assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineWidth`), '2px');
  await screenshot('landing-desktop-focus', false);
  await evaluate(`document.querySelector('.landing-secondary').click()`);
  await until(`location.hash === '#discover' && document.querySelector('#discover').getBoundingClientRect().top < innerHeight`);
  passed('desktop composition, keyboard skip link, visible focus and Discover anchor');
  await evaluate(`document.querySelector('.landing-primary').click()`);
  await until(`location.pathname === '/create' && document.querySelector('#project-name')`);
  passed('Open a Yawrd navigates to the hydrated Creation Builder');

  await navigate('/', 390, 844, true);
  assert.equal(await evaluate(`getComputedStyle(document.documentElement).scrollBehavior`), 'auto');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.landing-primary')).transitionDuration`), '0s');
  await screenshot('landing-mobile-reduced-motion');
  await navigate('/', 1440, 1000, true);
  passed('reduced motion disables transitions and smooth anchor scrolling');

  await evaluate(`document.querySelector('.landing-footer a[href="/docs"]').click()`);
  await until(`location.pathname === '/docs' && document.body.innerText.includes('Back to Yawrd')`);
  assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, 'Docs navigation preserves the layout');
  passed('preserved footer Docs link navigates to documentation');

  for (const width of [1440, 390, 320]) {
    await navigate('/create', width, width < 500 ? 844 : 1000);
    await until(`document.querySelector('button')?.textContent !== undefined && document.querySelector('#project-name')`);
    await until(`[...document.images].every(img => img.complete && img.naturalWidth > 0)`);
    assert.equal(await evaluate(`document.body.innerText.includes('Preview only · Testnet opening is currently unavailable.')`), true);
    assert.equal(await evaluate(`document.querySelector('nav[aria-label="Creation steps"] [aria-current="step"]').textContent.includes('Yawrd Details')`), true);
    assert.equal(await evaluate(`document.querySelector('aside').innerText.includes('2 Stewards · 2 approvals needed')`), true);
    assert.equal(await evaluate(`document.querySelector('aside').innerText.includes('the-common-table.[Testnet factory]')`), true);
    assert.equal(await evaluate(`document.body.innerText.includes('sputnik-dao.near')`), false);
    if (width === 1440) {
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
      assert.equal(await evaluate(`document.activeElement.getAttribute('href')`), '#create-content');
      await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await until(`document.activeElement.id === 'create-content'`);
      await evaluate(`document.activeElement.blur(); window.scrollTo({ top: 0, behavior: 'instant' })`);
    }
    await screenshot(`create-${width}`);
    await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Next').click()`);
    await until(`document.querySelector('#step-title').textContent.includes('Yawrd Stewards')`);
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, `Stewards at ${width}px must not overflow`);
    assert.equal(await evaluate(`document.querySelectorAll('input[aria-label^="Additional Steward"]').length`), 1);
    assert.equal(await evaluate(`document.querySelector('#approval-threshold').value`), '2');
    await screenshot(`create-stewards-${width}`);
    if (width === 1440) {
      await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent.includes('Add a Steward')).click()`);
      await until(`document.querySelectorAll('input[aria-label^="Additional Steward"]').length === 2`);
      await evaluate(`(() => {
        const input = document.querySelector('input[aria-label="Additional Steward 2 account ID"]');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'second-example.testnet');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await until(`document.querySelector('aside').innerText.includes('3 Stewards · 2 approvals needed')`);
      await evaluate(`document.querySelector('button[aria-label="Remove additional Steward 2"]').click()`);
      await until(`document.querySelector('aside').innerText.includes('2 Stewards · 2 approvals needed')`);
      assert.equal(await evaluate(`document.querySelector('input[aria-label="Additional Steward 1 account ID"]').value`), 'maya.example.testnet');
    }
    await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Back').click()`);
    await until(`document.querySelector('#project-name')`);
  }
  await evaluate(`(() => {
    const input = document.querySelector('#project-name');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Next').click()`);
  await until(`document.querySelector('#project-name').getAttribute('aria-invalid') === 'true'`);
  assert.equal(await evaluate(`document.querySelector('#step-title').textContent.includes('Yawrd Details')`), true);
  await evaluate(`(() => {
    const input = document.querySelector('#project-name');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Acceptance idea');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await until(`document.querySelector('#project-label').value === 'acceptance-idea'`);
  await until(`document.querySelector('aside').innerText.includes('acceptance-idea.[Testnet factory]')`);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Next').click()`);
  await until(`document.querySelector('#step-title').textContent.includes('Yawrd Stewards')`);
  assert.equal(await evaluate(`document.body.innerText.includes('No account connected')`), true);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Next').click()`);
  assert.equal(await evaluate(`document.querySelector('#step-title').textContent.includes('Yawrd Stewards')`), true, 'Disconnected wallet cannot reach review');
  await evaluate(`Array.from(document.querySelectorAll('button')).find(el => el.textContent === 'Back').click()`);
  await until(`document.querySelector('#project-name')?.value === 'Acceptance idea'`);
  passed('builder hydrates, validates details, preserves step state and blocks disconnected review');

  // All metadata below is explicitly synthetic. Return only an unresolved RPC
  // error, so this check cannot produce a mock completion or broadcast a call.
  const settings = { network: 'testnet', factoryAccountId: 'fixture-factory.testnet', expectedFactoryCodeHash: '4'.repeat(44), expectedDaoCodeHash: '5'.repeat(44), setupDepositYocto: '10000000000000000000000', createGas: '100000000000000', costConfirmation: 'Offline browser fixture; no deployment or real cost estimate' };
  const input = { projectName: 'Offline acceptance fixture', projectPurpose: 'Synthetic pending request', projectAccountLabel: 'offline-fixture', creatorAccountId: 'alice.testnet', initialStewardAccountIds: ['bob.testnet'], stewardApprovalThreshold: 2, factoryAccountId: settings.factoryAccountId };
  const prepared = prepareCreation(input, settings, { accountId: 'alice.testnet', network: 'testnet' });
  const saved = JSON.stringify({ phase: 'pending', message: 'Synthetic pending request', prepared, hash: '6'.repeat(44) });
  await evaluate(`localStorage.setItem(${JSON.stringify(ATTEMPT_KEY)}, ${JSON.stringify(saved)})`);
  const intercept = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const originalFetch = window.fetch;
    window.__offlineRpc = [];
    window.fetch = async (url, options) => {
      if (String(url) === 'https://rpc.testnet.near.org') {
        const request = JSON.parse(options.body);
        window.__offlineRpc.push(request);
        return new Response(JSON.stringify(request.method === 'status' ? { result: { chain_id: 'testnet' } } : { error: { cause: { name: 'UNKNOWN_TRANSACTION' } } }), { status: 200 });
      }
      return originalFetch(url, options);
    };
  })();` });
  const callbackHash = '7'.repeat(44);
  for (const path of [`/?transactionHashes=${callbackHash}&wallet=meteor&repeat=1&repeat=2`, `/create?transactionHashes=${callbackHash}`]) {
    await cdp('Page.navigate', { url: origin + path });
    await until(`location.pathname === '/create' && window.__offlineRpc?.some(r => r.method === 'EXPERIMENTAL_tx_status') && document.body.innerText.includes('Testnet RPC request failed')`);
    const calls = await evaluate('window.__offlineRpc');
    assert.ok(calls.every(call => ['status', 'EXPERIMENTAL_tx_status'].includes(call.method)));
    assert.equal(calls.find(call => call.method === 'EXPERIMENTAL_tx_status').params.tx_hash, callbackHash);
    assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(ATTEMPT_KEY)})`), saved, 'No failed reconciliation overwrites the durable request');
    assert.equal(await evaluate(`document.querySelector('#creation-hash').value`), callbackHash);
    assert.equal(await evaluate(`document.body.innerText.includes('Yawrd opened.')`), false);
  }
  await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: intercept.identifier });
  await evaluate(`localStorage.removeItem(${JSON.stringify(ATTEMPT_KEY)})`);
  passed('legacy and direct callbacks restore the same pending request and reconcile the returned hash without signing or claiming completion');
  assert.deepEqual(pageErrors, [], 'No uncaught browser errors');
  await cdp('Browser.close');
  ws.close();
  await writeFile(join(directory, 'results.json'), JSON.stringify({ origin, results, pageErrors, externalRequestsBlocked: true }, null, 2) + '\n');
  console.log(`Screenshots and results: ${directory}`);
} finally {
  ws?.close();
  if (browser && browser.exitCode === null && browser.signalCode === null) {
    browser.kill('SIGTERM');
    await Promise.race([once(browser, 'exit'), pause(3000).then(() => browser.kill('SIGKILL'))]);
  }
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
