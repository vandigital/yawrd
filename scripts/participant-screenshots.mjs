// Isolated Chromium profiles; never reads the user's browser or wallet storage.
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const directory = fileURLToPath(new URL('../docs/verification/milestone-07b/', import.meta.url));
const results = [];
for (const [state, width, height] of [['public',1280,1700],['apply',1280,1700],['pending',1280,1500],['approved',1280,1650],['rejected',1280,1500],['creator',1280,1900],['fixture',1280,1450],['apply',390,2100],['approved',390,2100],['creator',390,2700],['pending',320,2100]]) {
  const profile = await mkdtemp(join(tmpdir(), 'yawrd-07b-browser-'));
  const page = join(directory, `${state}.html`);
  const html = await readFile(page, 'utf8');
  if (!html.includes('dataset.overflow')) await writeFile(page, html.replace('</body>', '<script>document.documentElement.dataset.overflow=String(document.documentElement.scrollWidth>innerWidth)</script></body>'));
  try {
    const result = spawnSync('chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--disable-component-update', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, `--window-size=${width},${height}`, '--hide-scrollbars', '--allow-file-access-from-files', '--virtual-time-budget=1000', '--dump-dom', `--screenshot=${join(directory, `${state}-${width}.png`)}`, `file://${page}`], { encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 });
    if (result.status !== 0) throw new Error('Isolated Chromium could not start. No browser logs were copied.');
    const passed = result.stdout.includes('data-overflow="false"');
    results.push({ state, width, noHorizontalOverflow: passed });
    console.log(`${state} ${width}px: ${passed ? 'passed' : 'overflow detected'}`);
    if (!passed) process.exitCode = 1;
  } finally { await rm(profile, { recursive: true, force: true }); }
}
await writeFile(join(directory, 'browser-results.json'), JSON.stringify(results, null, 2) + '\n');
