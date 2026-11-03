// Anonymous local checks only. Run against the isolated production build with
// no database settings. Fresh Chromium profile; external traffic is blocked.
// node scripts/check-genesis-public.mjs [http://127.0.0.1:3112] [artifact-directory]
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const origin = new URL(process.argv[2] ?? 'http://127.0.0.1:3112').origin;
assert.ok(['http://127.0.0.1:3112', 'http://localhost:3112', 'http://127.0.0.1:3107', 'http://localhost:3107'].includes(origin), 'Use an isolated local preview port');
const directory = resolve(process.argv[3] ?? '/tmp/yawrd-yaw001-unit2b-review-20261103');
const results = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function passed(check) { results.push(check); console.log(`Passed: ${check}`); }
async function http(path, headers = {}) {
  return fetch(origin + path, { headers, redirect: 'manual', signal: AbortSignal.timeout(15000) });
}
await mkdir(directory, { recursive: true });
let approvedArticle;
for (const [path, headers] of [
  ['/yawrd/yaw-001', {}],
  ['/yawrd/yaw-001?accountId=PRIVATE_SENTINEL&published=true&apply=true', {}],
  ['/yawrd/yaw-001', { cookie: '__Host-yawrd_session=forged-public-test-cookie' }],
]) {
  const response = await http(path, headers);
  assert.equal(response.status, 200, path);
  assert.equal(response.headers.get('set-cookie'), null);
  const html = await response.text();
  assert.ok(html.includes('<title>YAW-001 · Build Progress | Yawrd</title>'));
  assert.ok(html.includes('Applications are not yet open'));
  assert.doesNotMatch(html, /restrictedContent|participant-introduction|Connect Meteor/);
  const article = html.match(/<article[\s\S]*?<\/article>/)?.[0];
  assert.ok(article);
  // Next.js may serialize the visitor's own query into its router payload.
  // It must never become project content or metadata.
  assert.doesNotMatch(article, /PRIVATE_SENTINEL/);
  assert.doesNotMatch(html.match(/<head[\s\S]*?<\/head>/)?.[0] ?? '', /PRIVATE_SENTINEL/);
  if (approvedArticle) assert.equal(article, approvedArticle, 'Cookie and query values cannot change the approved snapshot');
  approvedArticle = article;
}
passed('anonymous route and metadata resolve; forged query/cookie state cannot change the public snapshot');
for (const [path, text] of [
  ['/', 'Explore this Yawrd'], ['/docs', 'Yawrd'],
  ['/create', 'Create your Yawrd'], ['/yawrd/the-common-table', 'Fixture preview'],
]) {
  const response = await http(path);
  assert.equal(response.status, 200, path);
  assert.ok((await response.text()).replace(/<[^>]*>/g, '').includes(text), path);
}
const landing = await (await http('/')).text();
assert.match(landing, /href="\/yawrd\/yaw-001"/);
const legacy = await http('/?transactionHashes=anonymous-check&wallet=meteor');
assert.equal(legacy.status, 307);
const redirect = new URL(legacy.headers.get('location'), origin);
assert.equal(redirect.pathname, '/create');
assert.equal(redirect.search, '?transactionHashes=anonymous-check&wallet=meteor');
const unavailable = await (await http('/yawrd/unpublished-sentinel')).text();
assert.ok(unavailable.includes('Project temporarily unavailable'));
assert.ok(unavailable.includes('<title>Yawrd project space</title>'));
assert.ok(!/restrictedContent|participant-introduction/.test(unavailable), 'No private fields in the unavailable response');
passed('landing, docs, builder, fixture and legacy wallet-return navigation remain compatible; unconfigured private records fail closed');

const profile = await mkdtemp(join(tmpdir(), 'yawrd-genesis-browser-'));
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
  const projectRequests = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Network.requestWillBeSent') projectRequests.push(message.params.request.url);
  });
  for (const width of [1440, 1024, 768, 390, 320]) {
    await navigate('/yawrd/yaw-001', width, width < 500 ? 844 : 1000);
    assert.equal(await evaluate(`document.querySelectorAll('h1').length`), 1);
    assert.equal(await evaluate(`document.querySelector('h1').textContent`), 'Build Progress');
    assert.equal(await evaluate(`document.querySelector('header').innerText.includes('Public Genesis preview')`), true);
    const brand = await evaluate(`[...document.querySelectorAll('img[src="/brand/yawrd-buoy.webp"]')].map(img => ({ loaded: img.complete && img.naturalWidth === 159 && img.naturalHeight === 192, height: img.getBoundingClientRect().height }))`);
    assert.equal(brand.length, 2, 'Header and banner share the canonical brand asset');
    assert.ok(brand.every(img => img.loaded));
    assert.ok(brand[1].height >= 96, 'Banner brand icon is prominent');
    assert.equal(await evaluate(`document.querySelector('[aria-label="Default Yawrder buoy avatar"]').closest('dd').innerText.includes('yawrd1.testnet')`), true);
    assert.equal(await evaluate(`document.querySelector('[aria-label="Default Yawrder buoy avatar"]').closest('dd').innerText.includes('Default buoy avatar')`), true);
    assert.equal(await evaluate(`document.querySelector('[aria-label="Default Yawrder buoy avatar"] svg') !== null`), true);
    assert.equal(await evaluate(`document.querySelectorAll('button, form, input, textarea, select').length`), 0);
    assert.equal(await evaluate(`document.cookie`), '');
    assert.equal(await evaluate(`document.body.innerText.includes('Applications are not yet open')`), true);
    assert.equal(await evaluate(`document.body.innerText.includes('activation for participation remains pending')`), true);
    assert.equal(await evaluate(`[...document.querySelectorAll('[aria-labelledby]')].every(el => el.getAttribute('aria-labelledby').split(' ').every(id => document.getElementById(id)))`), true);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('article')).borderRadius`), '24px');
    const asideBelow = await evaluate(`document.querySelector('aside').getBoundingClientRect().top > document.querySelector('#genesis-rewards-title').getBoundingClientRect().top`);
    assert.equal(asideBelow, width < 1024, 'Identity and evidence stack below content on small screens');
    await screenshot(`genesis-${width}`);
  }
  assert.equal(projectRequests.some(url => new URL(url).pathname.startsWith('/api/')), false, 'Public Genesis makes no participant/auth API requests');
  assert.equal(projectRequests.some(url => !url.startsWith(origin + '/')), false, 'Public Genesis makes no external requests');
  passed('anonymous responsive layout at 1440, 1024, 768, 390 and 320px; canonical header/banner icon and distinct default creator avatar; no overflow, application controls or API/external requests');
  await navigate('/yawrd/yaw-001', 1440);
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')`), 'Yawrd home');
  assert.equal(await evaluate(`getComputedStyle(document.activeElement).outlineWidth`), '2px');
  await evaluate(`document.querySelector('a[href="/#discover"]').click()`);
  await until(`location.pathname === '/' && location.hash === '#discover'`);
  await evaluate(`document.querySelector('a[href="/yawrd/yaw-001"]').click()`);
  await until(`location.pathname === '/yawrd/yaw-001' && document.querySelector('h1')?.textContent === 'Build Progress'`);
  await evaluate(`document.querySelector('a[href="/docs"]').click()`);
  await until(`location.pathname === '/docs'`);
  passed('visible keyboard focus and browser navigation between featured Yawrd, project and docs');
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
