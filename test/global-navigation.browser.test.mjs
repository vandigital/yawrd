// Run after npm run build and starting the candidate on 127.0.0.1:3091.
// External browser requests are blocked; no live wallet or database is needed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

test('built shared navigation works across routes and viewport widths', { timeout: 60000 }, async t => {
  const temporary = await mkdtemp('/tmp/yawrd-navigation-browser-');
  let browser, ws, sequence = 0;
  const pending = new Map(), blocked = [];
  function call(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timed out')); }, 10000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async function evaluate(expression) {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }
  async function waitFor(expression) {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (await evaluate(expression)) return;
      await delay(30);
    }
    assert.fail('Browser condition timed out: ' + expression);
  }
  try {
    const origin = process.env.YAWRD_NAV_TEST_ORIGIN ?? 'http://127.0.0.1:3091';
    browser = spawn('/usr/bin/chromium', ['--headless', '--no-sandbox', '--disable-extensions', '--disable-gpu',
      '--disable-background-networking', '--disable-component-update', '--no-first-run', '--no-default-browser-check',
      '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--remote-debugging-port=0', '--user-data-dir=' + temporary + '/profile', 'about:blank'], { stdio: 'ignore' });
    let port;
    for (let i = 0; i < 150; i++) {
      try { port = Number((await readFile(temporary + '/profile/DevToolsActivePort', 'utf8')).split('\n')[0]); break; }
      catch { await delay(30); }
    }
    assert.ok(port, 'isolated Chromium started');
    const tabs = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    ws = new WebSocket(tabs.find(tab => tab.type === 'page').webSocketDebuggerUrl);
    await new Promise(resolveOpen => ws.addEventListener('open', resolveOpen, { once: true }));
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const job = pending.get(message.id);
        if (job) { pending.delete(message.id); message.error ? job.reject(new Error(message.error.message)) : job.resolve(message.result); }
      }
      if (message.method === 'Fetch.requestPaused') {
        const { requestId, request } = message.params;
        const local = request.url.startsWith(origin + '/');
        if (!local) blocked.push(request.url);
        call(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local ? { requestId } : { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      }
    });

    await call('Page.enable'); await call('Runtime.enable'); await call('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    for (const path of ['/', '/create', '/docs', '/yawrd/yaw-001', '/yawrd/the-common-table', '/yawrd/unknown-project']) {
      for (const width of [320, 390, 768, 1440]) {
        await call('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false });
        await evaluate('window.__previousDocument = true');
        await call('Page.navigate', { url: origin + path });
        await waitFor('!window.__previousDocument && document.readyState === "complete" && !!document.getElementById("global-account")');
        await delay(200);
        console.log('Checking', path, width);
        const result = await evaluate(`(() => {
          const header = document.querySelector('header');
          const account = document.getElementById('global-account');
          const brand = header.querySelector('[aria-label="Yawrd home"]');
          return {headers: document.querySelectorAll('header').length,
            accounts: document.querySelectorAll('#global-account').length,
            overflow: document.documentElement.scrollWidth > innerWidth,
            headerOverflow: header.scrollWidth > innerWidth,
            brand: !!brand.querySelector('img[src="/brand/yawrd-buoy.webp"]'),
            height: header.getBoundingClientRect().height,
            testnet: header.textContent.includes('Testnet')};
        })()`);
        assert.equal(result.headers, 1, path + ' single header');
        assert.equal(result.accounts, 1, path + ' single account');
        assert.equal(result.headerOverflow, false, path + ' header at ' + width);
        assert.equal(result.overflow, false, path + ' page overflow at ' + width);
        assert.equal(result.brand, true); assert.equal(result.testnet, true);
        assert.ok(result.height <= 106, 'compact single row');
        assert.equal(await evaluate(`!!document.querySelector('#global-account a[href="/yawrd/yaw-001"]')`), false, 'no global YAW-001 sign-in promotion');
        if (path === '/') {
          assert.equal(await evaluate(`!!document.querySelector('footer a[href="/docs"]')`), false, 'no redundant footer Docs link');
          assert.equal(await evaluate('document.querySelector("footer").textContent.includes("A Keelbase Experience.")'), true);
          assert.equal(await evaluate(`!!document.querySelector('footer [aria-label="Yawrd home"]')`), true);
        }
        await evaluate('document.querySelector("#global-account > summary").focus()');
        await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
        await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });

        await waitFor('document.getElementById("global-account").open');
        assert.equal(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), 'solid');
        assert.equal(await evaluate('document.querySelector("#global-account button").getBoundingClientRect().height >= 44'), true);
        assert.equal(await evaluate('(()=>{const r=document.querySelector("#global-account > div").getBoundingClientRect();return r.left>=0 && r.right<=innerWidth})()'), true);
        await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
        await waitFor('!document.getElementById("global-account").open');
        assert.equal(await evaluate('document.activeElement === document.querySelector("#global-account > summary")'), true);
        if (width <= 390) {
          assert.equal(await evaluate('document.querySelector("summary[aria-label=Menu]").textContent.trim()'), '');
          assert.equal(await evaluate('!!document.querySelector("summary[aria-label=Menu] svg[aria-hidden=true]")'), true);
          assert.equal(await evaluate('(()=>{const r=document.querySelector("summary[aria-label=Menu]").getBoundingClientRect();return r.width>=44 && r.height>=44})()'), true);
          await evaluate('document.querySelector("summary[aria-label=Menu]").focus()');
          await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 });
          await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
          await waitFor('document.querySelector("summary[aria-label=Menu]").parentElement.open');
          assert.deepEqual(await evaluate(`[...document.querySelector('nav[aria-label="Mobile navigation"]').querySelectorAll('a')].map(a=>a.getAttribute('href'))`), ['/#discover', '/docs']);
          await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
          await waitFor('!document.querySelector("summary[aria-label=Menu]").parentElement.open');
          assert.equal(await evaluate('document.activeElement === document.querySelector("summary[aria-label=Menu]")'), true);
          await evaluate('document.querySelector("summary[aria-label=Menu]").click()');
          await evaluate('document.querySelector("#global-account > summary").click()');
          await waitFor('document.getElementById("global-account").open && !document.querySelector("summary[aria-label=Menu]").parentElement.open');
          await evaluate('document.querySelector("main").dispatchEvent(new PointerEvent("pointerdown", {bubbles:true}))');
          await waitFor('!document.getElementById("global-account").open');
        }
        if (path === '/') {
          const shot = await call('Page.captureScreenshot', { format: 'png' });
          await writeFile('/tmp/yawrd-navigation-' + width + '.png', Buffer.from(shot.data, 'base64'));
        }
      }
    }
    // The production candidate has no database credentials. Verify the honest error state.
    await call('Page.navigate', { url: origin + '/yawrd/yaw-001' });
    await waitFor('document.body.textContent.includes("Project temporarily unavailable")');
    assert.equal(await evaluate('document.querySelectorAll("header").length'), 1);
    await call('Emulation.setDeviceMetricsOverride', { width: 768, height: 900, deviceScaleFactor: 1, mobile: false });
    await call('Page.navigate', { url: origin + '/' });
    await waitFor('document.readyState === "complete" && !!document.getElementById("discover")');
    await evaluate(`window.navigationSentinel = true; document.querySelector('nav[aria-label="Global navigation"] a[href="/docs"]').click()`);
    await waitFor('location.pathname === "/docs" && !!document.getElementById("docs-content")');
    assert.equal(await evaluate('window.navigationSentinel'), true, 'client navigation preserves the root owner');
    await evaluate(`document.querySelector('nav[aria-label="Global navigation"] a[href="/#discover"]').click()`);
    await waitFor('location.pathname === "/" && location.hash === "#discover" && !!document.getElementById("discover")');
    assert.equal(await evaluate('window.navigationSentinel'), true);
  } finally {
    ws?.close();
    if (browser && browser.exitCode === null) {
      const exited = new Promise(resolveExit => browser.once('exit', resolveExit));
      browser.kill('SIGKILL'); await exited;
    }
    await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
