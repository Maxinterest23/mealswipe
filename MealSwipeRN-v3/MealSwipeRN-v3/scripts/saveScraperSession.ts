import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

const DEFAULT_STORAGE_STATE = path.join(process.cwd(), 'scripts', 'scraper-storage.json');

function loadDotEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  let targetUrl = 'https://www.tesco.com/';
  let storageStatePath = process.env.SCRAPER_STORAGE_STATE || DEFAULT_STORAGE_STATE;

  args.forEach((arg) => {
    if (arg.startsWith('--url=')) {
      targetUrl = arg.split('=')[1];
    } else if (arg.startsWith('--storage=')) {
      storageStatePath = arg.split('=')[1];
    } else if (arg === '--morrisons') {
      targetUrl = 'https://groceries.morrisons.com/';
    } else if (arg === '--tesco') {
      targetUrl = 'https://www.tesco.com/';
    }
  });

  return { targetUrl, storageStatePath };
}

async function waitForEnter() {
  return new Promise<void>((resolve) => {
    process.stdin.resume();
    process.stdin.once('data', () => {
      process.stdin.pause();
      resolve();
    });
  });
}

async function main() {
  loadDotEnv();

  const { targetUrl, storageStatePath } = parseArgs();
  const userAgent = process.env.SCRAPER_USER_AGENT ?? DEFAULT_USER_AGENT;

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ userAgent });
  const page = await context.newPage();

  console.log(`Opening ${targetUrl}`);
  console.log('Complete any bot checks or logins, then press Enter in this terminal.');

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await waitForEnter();

  await context.storageState({ path: storageStatePath });
  console.log(`Saved storage state to ${storageStatePath}`);

  await context.close();
  await browser.close();
}

main().catch((error) => {
  console.error('Session save failed:', error);
  process.exit(1);
});
