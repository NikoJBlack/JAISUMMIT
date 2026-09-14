import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { requireConfig } from '../config.js';
import { run, commandExists } from '../lib/proc.js';

const DEPLOY_URL_RE = /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.pages\.dev/i;

function resolveProjectName(root, config) {
  if (config.cloudflare?.projectName) return config.cloudflare.projectName;
  const wranglerToml = path.join(root, 'cf', 'wrangler.toml');
  if (existsSync(wranglerToml)) {
    const m = /^\s*name\s*=\s*"([^"]+)"/m.exec(readFileSync(wranglerToml, 'utf8'));
    if (m) return m[1];
  }
  return null;
}

export async function deploy(root, { log, dryRun = false, preview = false } = {}) {
  const config = requireConfig(root);
  const projectName = resolveProjectName(root, config);

  if (!projectName) {
    throw new Error('No Cloudflare Pages project name configured — set cloudflare.projectName in jaipub.config.json (or add cf/wrangler.toml).');
  }
  if (!process.env.CLOUDFLARE_API_TOKEN && !dryRun) {
    throw new Error('CLOUDFLARE_API_TOKEN is not set. Export it (and CLOUDFLARE_ACCOUNT_ID, if your account has more than one) before running `jaipub deploy`.');
  }

  const wranglerCmd = commandExists('wrangler') ? 'wrangler' : 'npx';
  const baseArgs = commandExists('wrangler') ? [] : ['--yes', 'wrangler'];

  const args = [...baseArgs, 'pages', 'deploy', config.publishDir, '--project-name', projectName];
  if (preview) args.push('--branch', 'preview');

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || config.cloudflare?.accountId;
  const env = {};
  if (accountId) env.CLOUDFLARE_ACCOUNT_ID = accountId;

  const result = run(wranglerCmd, args, { cwd: root, dryRun, log, env });

  if (dryRun) {
    log?.info(`Would deploy ${config.publishDir}/ to Cloudflare Pages project "${projectName}"${preview ? ' (preview branch)' : ''}.`);
    log?.printJson({ ok: true, dryRun: true, projectName, preview });
    return { ok: true, dryRun: true };
  }

  const m = DEPLOY_URL_RE.exec(result.stdout + result.stderr);
  const deployUrl = m ? m[0] : null;

  if (deployUrl) {
    log?.success(`Deployed: ${deployUrl}`);
    if (!preview && config.domain) {
      log?.info(`Production alias: https://${config.domain} (points at the "${projectName}" project's latest production deployment)`);
    }
    await pollUntilLive(deployUrl, { log });
  } else {
    log?.warn('Deploy command succeeded but no *.pages.dev URL was found in its output.');
  }

  log?.printJson({ ok: true, projectName, preview, deployUrl });
  return { ok: true, projectName, preview, deployUrl };
}

async function pollUntilLive(url, { log, attempts = 10, delayMs = 3000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) {
        log?.success(`Live: ${url} responded ${res.status}`);
        return true;
      }
      log?.step(`poll ${i + 1}/${attempts}: ${res.status}`);
    } catch (err) {
      log?.step(`poll ${i + 1}/${attempts}: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  log?.warn(`${url} did not respond with a 2xx within ${(attempts * delayMs) / 1000}s — check the Cloudflare dashboard.`);
  return false;
}
