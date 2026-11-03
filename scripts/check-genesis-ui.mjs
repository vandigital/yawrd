// Run after genesis-ui-preview.tsx. Isolated Chromium, offline mocks only.
// node scripts/check-genesis-ui.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { tmpdir } from 'node:os';

const output = resolve('docs/verification/genesis-ui');
const results = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (!/^\/(?:[a-z-]+\.html|preview\.(?:js|css)|(?:brand|landing)\/[a-zA-Z0-9._-]+)$/.test(path)) { response.writeHead(404).end(); return; }
  try {
    const data = await readFile(join(output, path));
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png' };
    response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(data);
  } catch { response.writeHead(404).end(); }
});
const profile = await mkdtemp(join(tmpdir(), 'yawrd-genesis-ui-browser-'));
let browser, ws;
try {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = spawn('chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await pause(100); }
  }
  assert.ok(port, 'Chromium started');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  ws = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl); await once(ws, 'open');
  let sequence = 0;
  const pending = new Map(), errors = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map(arg => arg.value ?? arg.description).join(' '));
    const callback = pending.get(message.id); if (callback) { pending.delete(message.id); callback(message); }
  });
  async function cdp(method, params = {}) {
    const id = ++sequence; let timer;
    try {
      const response = new Promise((resolve, reject) => { pending.set(id, resolve); timer = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 15000); });
      ws.send(JSON.stringify({ id, method, params }));
      const message = await response; assert.equal(message.error, undefined, method); return message.result;
    } finally { clearTimeout(timer); pending.delete(id); }
  }
  async function evaluate(expression) {
    const result = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.equal(result.exceptionDetails, undefined, expression); return result.result.value;
  }
  async function until(expression) {
    for (let i = 0; i < 100; i++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(50); }
    assert.fail(`Browser condition: ${expression}`);
  }
  async function click(text) {
    assert.equal(await evaluate(`(()=>{const el=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)});if(!el||el.disabled)return false;el.click();return true;})()`), true, `Enabled button: ${text}`);
    await pause(50);
  }
  async function navigate(state, width) {
    await cdp('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 500 });
    await cdp('Page.navigate', { url: `${origin}/${state}.html` });
    await until(`document.readyState === 'complete' && location.pathname === '/${state}.html' && window.__setWallet && document.querySelector('header')`);
    assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'), false, `${state} at ${width}px`);
    assert.equal(await evaluate('document.querySelectorAll("header").length'), 1);
    assert.equal(await evaluate('document.querySelectorAll("h1").length'), 1);
    assert.equal(await evaluate('[...document.images].every(img=>img.complete&&img.naturalWidth>0)'), true, 'Brand images loaded');
  }
  async function screenshot(name) {
    const { cssContentSize: size } = await cdp('Page.getLayoutMetrics');
    const result = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: size.width, height: size.height, scale: 1 } });
    await writeFile(join(output, `${name}.png`), Buffer.from(result.data, 'base64'));
  }
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
  await cdp('Network.setBlockedURLs', { urls: ['https://*'] });
  for (const state of ['visitor', 'applicant', 'creator', 'pending', 'approved', 'rejected', 'approved-content']) {
    for (const width of [1440, 768, 390, 320]) {
      await navigate(state, width);
      if (width === 1440 || width === 390) await screenshot(`${state}-${width}`);
      results.push(`No overflow, one header and loaded branding: ${state} ${width}px`);
    }
  }
  await navigate('visitor', 390);
  await click('Connect Meteor');
  await until(`document.querySelector('#project-wallet').textContent.includes('Meteor connected')`);
  assert.equal(await evaluate(`document.querySelector('#project-wallet').textContent.includes('Not signed in')`), true);
  assert.equal(await evaluate(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Connect Meteor')`), false);
  await evaluate('window.__failNext=true'); await click('Prepare sign-in message');
  await until(`document.querySelector('header [role="alert"]')`);
  await click('Prepare sign-in message');
  await until(`document.querySelector('pre')`);
  await screenshot('sign-in-message-390');
  await evaluate(`const select=document.querySelector('select');select.value='alternate.example.testnet';select.dispatchEvent(new Event('change',{bubbles:true}));`);
  await until(`!document.querySelector('pre')`);
  await click('Prepare sign-in message'); await until(`document.querySelector('pre')`);
  await click('Approve sign-in message in Meteor');
  await until(`document.querySelector('textarea')`);
  assert.equal(await evaluate(`window.__signRequests[0].signerId`), 'alternate.example.testnet');
  assert.equal(await evaluate(`window.__requests.find(r=>r.url==='/api/auth/verify').body.proof.accountId`), 'alternate.example.testnet');
  await click('Disconnect Meteor');
  await until(`document.querySelector('#project-wallet').textContent.includes('Wallet disconnected')`);
  assert.equal(await evaluate(`document.querySelector('#project-wallet').textContent.includes('NEP-413 verified · alternate.example.testnet')`), true);
  await click('Sign out'); await until(`!document.querySelector('textarea') && !document.querySelector('#project-wallet').textContent.includes('NEP-413 verified')`);
  results.push('Connection is separate from verification; errors visible; account switch clears challenge; selected signer preserved; disconnect and logout distinct');
  for (const decision of ['Approve', 'Reject']) {
    await navigate('creator', 1440); await click(decision);
    await until(`!document.querySelector('button') || ![...document.querySelectorAll('button')].some(b=>b.textContent==='Approve')`);
    assert.equal(await evaluate(`window.__requests.find(r=>r.url.endsWith('/review')).body.decision`), decision === 'Approve' ? 'approved' : 'rejected');
    assert.equal(await evaluate(`document.querySelector('form')===null`), true);
  }
  results.push('Creator review retains approve/reject API payloads and removes final-decision actions');
  await navigate('applicant', 390);
  await evaluate(`const field=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,'Offline application interaction test');field.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('input[type=checkbox]').click();`);
  await click('Apply to Join'); await until(`document.querySelector('[role="status"]').textContent.includes('Application pending')`);
  assert.deepEqual(await evaluate(`window.__requests.find(r=>r.url.endsWith('/apply')).body`), { introduction: 'Offline application interaction test', consent: true });
  results.push('Application submits the existing introduction/consent payload and renders returned pending status');
  assert.deepEqual(errors, [], 'No hydration, console or runtime errors');
  await writeFile(join(output, 'browser-results.json'), JSON.stringify({ offlineMocksOnly: true, passed: results }, null, 2) + '\n');
  console.log(`Passed ${results.length} browser checks; screenshots: ${output}`);
} finally {
  ws?.close();
  if (browser && browser.exitCode === null) { const exited = once(browser, 'exit'); browser.kill(); await exited; }
  server.close(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
