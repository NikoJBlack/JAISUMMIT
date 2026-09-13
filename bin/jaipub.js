#!/usr/bin/env node
import { parseArgs } from 'node:util';
import process from 'node:process';
import { makeLogger, color } from '../src/lib/log.js';
import { check } from '../src/commands/check.js';
import { build } from '../src/commands/build.js';
import { push } from '../src/commands/push.js';
import { deploy } from '../src/commands/deploy.js';
import { ship } from '../src/commands/ship.js';
import { verify } from '../src/commands/verify.js';
import { init } from '../src/commands/init.js';

const ROOT = process.cwd();

const COMMON_OPTIONS = {
  'dry-run': { type: 'boolean', default: false },
  verbose: { type: 'boolean', default: false },
  json: { type: 'boolean', default: false },
  help: { type: 'boolean', default: false },
};

const USAGE = `jaipub <command> [options]

Commands:
  init      Generate jaipub.config.json and github.md, set up git remote
  check     Preflight: verify links/assets in publish/, no network writes
  build     Refresh publish/ from source (per github.md's screen map)
  push      Commit publish/ + github.md and push to GitHub
  deploy    Deploy publish/ to Cloudflare Pages
  ship      check -> build -> push -> deploy, then update github.md
  verify    Smoke-test the live site on the configured domain

Common options:
  --dry-run     Print the exact ops without performing them
  --verbose     Show each step
  --json        Machine-readable output

Command options:
  build   --only <page>
  push    -m, --message <text>
  deploy  --preview
  ship    -m, --message <text>
  init    --repo <owner/name> --branch <name> --domain <domain>
          --cloudflare-project <name> --source-dir <dir>
`;

function fail(message) {
  console.error(color.red('✗ ') + message);
  process.exitCode = 1;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h') {
    console.log(USAGE);
    return;
  }

  let args;
  try {
    args = parseArgs({
      args: rest,
      allowPositionals: false,
      options: {
        ...COMMON_OPTIONS,
        only: { type: 'string' },
        message: { type: 'string', short: 'm' },
        preview: { type: 'boolean', default: false },
        repo: { type: 'string' },
        branch: { type: 'string' },
        domain: { type: 'string' },
        'cloudflare-project': { type: 'string' },
        'source-dir': { type: 'string' },
      },
    }).values;
  } catch (err) {
    fail(err.message);
    console.log(USAGE);
    return;
  }

  if (args.help) {
    console.log(USAGE);
    return;
  }

  const log = makeLogger({ json: args.json, verbose: args.verbose });
  const dryRun = args['dry-run'];

  try {
    let result;
    switch (command) {
      case 'init':
        result = await init(ROOT, {
          log,
          dryRun,
          repo: args.repo,
          branch: args.branch || 'main',
          domain: args.domain,
          cloudflareProject: args['cloudflare-project'],
          sourceDir: args['source-dir'],
        });
        break;
      case 'check':
        result = await check(ROOT, { log });
        break;
      case 'build':
        result = await build(ROOT, { log, dryRun, only: args.only });
        break;
      case 'push':
        result = await push(ROOT, { log, dryRun, message: args.message });
        break;
      case 'deploy':
        result = await deploy(ROOT, { log, dryRun, preview: args.preview });
        break;
      case 'ship':
        result = await ship(ROOT, { log, dryRun, message: args.message });
        break;
      case 'verify':
        result = await verify(ROOT, { log, json: args.json });
        break;
      default:
        fail(`Unknown command: ${command}`);
        console.log(USAGE);
        return;
    }

    if (result && result.ok === false) {
      process.exitCode = 1;
    }
  } catch (err) {
    fail(err.message);
    if (args.verbose && err.stack) console.error(color.gray(err.stack));
    process.exitCode = 1;
  }
}

main();
