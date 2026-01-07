const fs = require('fs');
const path = require('path');

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

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadDotEnv();

  const baseUrl = process.env.PROVIDER_BASE_URL;
  const apiKey = process.env.PROVIDER_API_KEY;
  const actorId = process.env.PROVIDER_ACTOR_ID;
  const productUrl = process.argv[2];

  if (!baseUrl || !apiKey || !actorId) {
    console.error('Missing PROVIDER_BASE_URL, PROVIDER_API_KEY, or PROVIDER_ACTOR_ID.');
    process.exit(1);
  }

  if (!productUrl) {
    console.error('Usage: node scripts/testApifyActor.js <product-url>');
    process.exit(1);
  }

  const normalizedActorId = actorId.includes('/') ? actorId.replace(/\//g, '~') : actorId;
  const endpoint = `${baseUrl.replace(/\/$/, '')}/acts/${normalizedActorId}/run-sync-get-dataset-items`;
  const url = new URL(endpoint);
  url.searchParams.set('clean', 'true');
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '3');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      detailsUrls: [{ url: productUrl }],
      additionalProperties: true,
      additionalReviewProperties: true,
      scrapeInfluencerProducts: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apify run failed: ${response.status} ${text}`);
  }

  const items = await response.json();
  if (!Array.isArray(items) || items.length === 0) {
    console.log('No items returned.');
    return;
  }

  console.log('First item:');
  console.log(JSON.stringify(items[0], null, 2));
}

main().catch((error) => {
  console.error('Test failed:', error.message);
  process.exit(1);
});
