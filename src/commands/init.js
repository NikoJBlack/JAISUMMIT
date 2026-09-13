import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { CONFIG_FILE, loadConfig, saveConfig } from '../config.js';
import { parseGithubMd, renderGithubMd } from '../lib/screenmap.js';
import { scanPublishDir } from '../lib/publishScan.js';
import { run, commandExists } from '../lib/proc.js';

function inferRepoFromGitRemote(root, log) {
  const result = run('git', ['remote', 'get-url', 'origin'], { cwd: root, log, allowFailure: true });
  if (result.status !== 0) return null;
  const url = result.stdout.trim();
  const m = /github\.com[:/]([^/]+\/[^/.]+)(\.git)?$/.exec(url);
  return m ? m[1] : null;
}

function inferCloudflareProject(root) {
  const wranglerToml = path.join(root, 'cf', 'wrangler.toml');
  if (!existsSync(wranglerToml)) return null;
  const m = /^\s*name\s*=\s*"([^"]+)"/m.exec(readFileSync(wranglerToml, 'utf8'));
  return m ? m[1] : null;
}

function resolveGitRemoteUrl(repo, log) {
  if (commandExists('gh')) {
    const result = run('gh', ['repo', 'view', repo, '--json', 'sshUrl', '-q', '.sshUrl'], { log, allowFailure: true });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  return `https://github.com/${repo}.git`;
}

export async function init(
  root,
  { log, dryRun = false, repo = null, branch = 'main', domain = null, cloudflareProject = null, sourceDir = null } = {}
) {
  const existing = loadConfig(root);
  const existingMd = existsSync(path.join(root, 'github.md')) ? parseGithubMd(readFileSync(path.join(root, 'github.md'), 'utf8')) : null;

  const resolvedRepo = repo || existing?.repo || existingMd?.repo || inferRepoFromGitRemote(root, log);
  const resolvedBranch = branch || existing?.branch || existingMd?.branch || 'main';
  const resolvedDomain = domain || existing?.domain || null;
  const resolvedCfProject = cloudflareProject || existing?.cloudflare?.projectName || inferCloudflareProject(root);
  const resolvedSourceDir = sourceDir ?? existing?.sourceDir ?? null;

  const missing = [];
  if (!resolvedRepo) missing.push('--repo <owner/name>');
  if (!resolvedCfProject) missing.push('--cloudflare-project <name>');
  if (missing.length) {
    throw new Error(`Could not infer everything jaipub needs. Pass: ${missing.join(', ')}`);
  }

  const config = {
    repo: resolvedRepo,
    branch: resolvedBranch,
    domain: resolvedDomain,
    publishDir: existing?.publishDir || 'publish',
    sourceDir: resolvedSourceDir,
    cloudflare: {
      projectName: resolvedCfProject,
      accountId: existing?.cloudflare?.accountId || null,
    },
  };

  if (!dryRun) {
    saveConfig(root, config);
  }
  log?.success(`${dryRun ? '[dry-run] would write' : 'wrote'} ${CONFIG_FILE}`);

  ensureGitignore(root, { dryRun, log });

  if (!existsSync(path.join(root, '.git'))) {
    run('git', ['init', '-b', resolvedBranch], { cwd: root, dryRun, log });
    const remoteUrl = resolveGitRemoteUrl(resolvedRepo, log);
    run('git', ['remote', 'add', 'origin', remoteUrl], { cwd: root, dryRun, log });
    log?.success(`${dryRun ? '[dry-run] would init' : 'initialized'} git repo, origin -> ${remoteUrl}`);
  } else {
    log?.step('.git already exists, leaving as-is');
  }

  ensureGithubMd(root, config, { dryRun, log });

  log?.printJson({ ok: true, config });
  return { ok: true, config };
}

function ensureGitignore(root, { dryRun, log }) {
  const p = path.join(root, '.gitignore');
  const required = [CONFIG_FILE, 'node_modules/', '.DS_Store', '*.zip'];
  const current = existsSync(p) ? readFileSync(p, 'utf8') : '';
  const lines = new Set(current.split('\n').map((l) => l.trim()).filter(Boolean));
  const toAdd = required.filter((r) => !lines.has(r));
  if (toAdd.length === 0) return;
  log?.step(`${dryRun ? '[dry-run] would add' : 'adding'} to .gitignore: ${toAdd.join(', ')}`);
  if (!dryRun) {
    const sep = current && !current.endsWith('\n') ? '\n' : '';
    appendFileSync(p, sep + toAdd.join('\n') + '\n');
  }
}

function ensureGithubMd(root, config, { dryRun, log }) {
  const p = path.join(root, 'github.md');
  if (existsSync(p)) {
    log?.step('github.md already exists, leaving its content as-is');
    return;
  }

  const publishDir = path.join(root, config.publishDir);
  const scan = existsSync(publishDir) ? scanPublishDir(publishDir) : { pages: [] };

  const data = {
    repo: config.repo,
    branch: config.branch,
    path: config.publishDir,
    lastSync: { date: new Date().toISOString(), commit: null, notes: ['jaipub initialized'] },
    syncHistory: [],
    screenMap: scan.pages.map((p) => ({ source: 'TBD', published: p })),
  };

  log?.success(`${dryRun ? '[dry-run] would write' : 'wrote'} github.md with ${data.screenMap.length} page(s) in the screen map`);
  if (!dryRun) {
    writeFileSync(p, renderGithubMd(data));
  }
}
