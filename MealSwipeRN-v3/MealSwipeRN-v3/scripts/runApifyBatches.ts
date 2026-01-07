import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

interface RunRecord {
  runId: string;
  inputFile: string;
}

interface RunStatus {
  status: string;
  defaultDatasetId?: string;
}

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeActorId(actorId: string) {
  return actorId.includes('/') ? actorId.replace(/\//g, '~') : actorId;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const stores: string[] = [];
  let batchSize = 25;
  let inputDir = path.join(process.cwd(), 'scripts', 'apify-input');
  let maxItems = 1000;
  let pageSize = 200;
  let waitSeconds = 15;
  let timeoutMinutes = 60;

  args.forEach((arg) => {
    if (arg.startsWith('--stores=')) {
      const value = arg.split('=')[1];
      stores.push(...value.split(',').map((store) => store.trim()).filter(Boolean));
    } else if (arg.startsWith('--batch=')) {
      batchSize = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--input-dir=')) {
      inputDir = path.resolve(arg.split('=')[1]);
    } else if (arg.startsWith('--max-items=')) {
      maxItems = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--page-size=')) {
      pageSize = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--wait-seconds=')) {
      waitSeconds = Number(arg.split('=')[1]);
    } else if (arg.startsWith('--timeout-minutes=')) {
      timeoutMinutes = Number(arg.split('=')[1]);
    }
  });

  return { stores, batchSize, inputDir, maxItems, pageSize, waitSeconds, timeoutMinutes };
}

async function ensureInputs(
  inputDir: string,
  stores: string[],
  batchSize: number
) {
  if (fs.existsSync(inputDir)) {
    const existing = fs.readdirSync(inputDir).filter((file) => file.endsWith('.json'));
    if (existing.length) return;
  }

  const args = ['scripts/exportApifyInput.ts'];
  if (stores.length) {
    args.push(`--stores=${stores.join(',')}`);
  }
  if (batchSize) {
    args.push(`--batch=${batchSize}`);
  }

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('node', args, { stdio: 'inherit', env: process.env });
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`exportApifyInput exited with code ${code}`));
    });
  });
}

function listInputFiles(inputDir: string) {
  if (!fs.existsSync(inputDir)) return [];
  return fs
    .readdirSync(inputDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => path.join(inputDir, file));
}

async function startRun(
  baseUrl: string,
  apiKey: string,
  actorId: string,
  inputFile: string
) {
  const normalizedActorId = normalizeActorId(actorId);
  const endpoint = `${baseUrl.replace(/\/$/, '')}/acts/${normalizedActorId}/runs`;
  const url = new URL(endpoint);
  url.searchParams.set('waitForFinish', '0');

  const input = fs.readFileSync(inputFile, 'utf8');
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: input,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Start run failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as { data?: { id?: string } };
  const runId = payload?.data?.id;
  if (!runId) {
    throw new Error('Start run response missing run id.');
  }

  return runId;
}

async function fetchRunStatus(baseUrl: string, apiKey: string, runId: string): Promise<RunStatus> {
  const endpoint = `${baseUrl.replace(/\/$/, '')}/actor-runs/${runId}`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fetch run status failed: ${response.status} ${text}`);
  }

  const payload = (await response.json()) as { data?: { status?: string; defaultDatasetId?: string } };
  return {
    status: payload?.data?.status ?? 'UNKNOWN',
    defaultDatasetId: payload?.data?.defaultDatasetId,
  };
}

async function ingestDataset(datasetId: string, maxItems: number, pageSize: number) {
  await new Promise<void>((resolve, reject) => {
    const args = [
      'scripts/refreshPricesFromDataset.ts',
      `--dataset=${datasetId}`,
      `--max-items=${maxItems}`,
      `--page-size=${pageSize}`,
    ];
    const proc = spawn('node', args, { stdio: 'inherit', env: process.env });
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`refreshPricesFromDataset exited with code ${code}`));
    });
  });
}

async function main() {
  loadDotEnv();

  const providerBaseUrl = process.env.PROVIDER_BASE_URL;
  const providerApiKey = process.env.PROVIDER_API_KEY;
  const providerActorId = process.env.PROVIDER_ACTOR_ID;

  if (!providerBaseUrl || !providerApiKey || !providerActorId) {
    console.error('Missing PROVIDER_BASE_URL, PROVIDER_API_KEY, or PROVIDER_ACTOR_ID.');
    process.exit(1);
  }

  const args = parseArgs();
  await ensureInputs(args.inputDir, args.stores, args.batchSize);
  const inputFiles = listInputFiles(args.inputDir);

  if (!inputFiles.length) {
    console.error(`No Apify input files found in ${args.inputDir}`);
    process.exit(1);
  }

  const runs: RunRecord[] = [];
  for (const inputFile of inputFiles) {
    try {
      const runId = await startRun(providerBaseUrl, providerApiKey, providerActorId, inputFile);
      runs.push({ runId, inputFile });
      console.log(`Started run ${runId} for ${path.basename(inputFile)}`);
    } catch (error) {
      console.error(`Failed to start run for ${path.basename(inputFile)}:`, error);
    }
  }

  if (!runs.length) {
    console.error('No runs started.');
    process.exit(1);
  }

  const deadline = Date.now() + args.timeoutMinutes * 60 * 1000;
  const pending = new Map<string, RunRecord>(runs.map((run) => [run.runId, run]));

  while (pending.size) {
    if (Date.now() > deadline) {
      console.error('Timed out waiting for Apify runs to finish.');
      process.exit(1);
    }

    const statuses = await Promise.all(
      Array.from(pending.values()).map(async (run) => {
        const status = await fetchRunStatus(providerBaseUrl, providerApiKey, run.runId);
        return { run, status };
      })
    );

    for (const { run, status } of statuses) {
      const normalizedStatus = status.status.toUpperCase();
      if (['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(normalizedStatus)) {
        pending.delete(run.runId);
        if (normalizedStatus === 'SUCCEEDED' && status.defaultDatasetId) {
          console.log(`Ingesting dataset ${status.defaultDatasetId} (run ${run.runId})`);
          await ingestDataset(status.defaultDatasetId, args.maxItems, args.pageSize);
        } else {
          console.warn(`Run ${run.runId} finished with status ${normalizedStatus}`);
        }
      }
    }

    if (pending.size) {
      await sleep(args.waitSeconds * 1000);
    }
  }

  console.log('All runs processed.');
}

main().catch((error) => {
  console.error('Run failed:', error);
  process.exit(1);
});
