import { existsSync } from 'node:fs';
import path from 'node:path';
import { requireConfig } from '../config.js';
import { run, commandExists } from '../lib/proc.js';

export async function push(root, { log, dryRun = false, message = null } = {}) {
  const config = requireConfig(root);

  if (!existsSync(path.join(root, '.git'))) {
    throw new Error('Not a git repository yet — run `jaipub init` first.');
  }

  const status = run('git', ['status', '--porcelain'], { cwd: root, log }).stdout;
  const changed = status
    .split('\n')
    .filter(Boolean)
    .map((line) => line.slice(3));

  const allowedPrefixes = [config.publishDir + '/', 'github.md'];
  const outside = changed.filter((f) => !allowedPrefixes.some((p) => f === p || f.startsWith(p)));
  if (outside.length > 0) {
    throw new Error(
      `Working tree has changes outside ${config.publishDir}/ and github.md — refusing to sweep them into a commit:\n` +
        outside.map((f) => `  ${f}`).join('\n')
    );
  }

  if (changed.length === 0) {
    log?.info('Nothing to commit — publish/ and github.md already match the working tree.');
    log?.printJson({ ok: true, committed: false, pushed: false });
    return { ok: true, committed: false, pushed: false, filesChanged: [] };
  }

  run('git', ['add', config.publishDir, 'github.md'], { cwd: root, dryRun, log });

  const diffCheck = dryRun ? { status: 1 } : run('git', ['diff', '--cached', '--quiet'], { cwd: root, log, allowFailure: true });
  const hasStagedChanges = dryRun || diffCheck.status !== 0;

  if (!hasStagedChanges) {
    log?.info('Nothing staged — working tree matches HEAD.');
    log?.printJson({ ok: true, committed: false, pushed: false });
    return { ok: true, committed: false, pushed: false, filesChanged: [] };
  }

  const commitMessage = message || generateCommitMessage(changed, config);
  run('git', ['commit', '-m', commitMessage], { cwd: root, dryRun, log });

  let sha = null;
  if (!dryRun) {
    sha = run('git', ['rev-parse', 'HEAD'], { cwd: root, log }).stdout.trim();
  }

  const pushed = pushToRemote(root, config, { dryRun, log });

  log?.success(dryRun ? `Would commit and push: ${commitMessage}` : `Committed ${sha?.slice(0, 7)} and pushed to ${config.branch}`);
  log?.printJson({ ok: true, committed: true, sha, message: commitMessage, pushed, filesChanged: changed });
  return { ok: true, committed: true, sha, message: commitMessage, pushed, filesChanged: changed };
}

function generateCommitMessage(changed, config) {
  const files = changed.filter((f) => f !== 'github.md');
  const summary = files.length <= 6 ? files.join(', ') : `${files.slice(0, 6).join(', ')}, +${files.length - 6} more`;
  return `jaipub: update ${config.publishDir}/ (${summary || 'github.md'})`;
}

function pushToRemote(root, config, { dryRun, log }) {
  const upstream = run('git', ['rev-parse', '--abbrev-ref', `${config.branch}@{upstream}`], {
    cwd: root,
    log,
    allowFailure: true,
  });
  const args = upstream.status === 0 ? ['push'] : ['push', '-u', 'origin', config.branch];

  try {
    run('git', args, { cwd: root, dryRun, log });
    return true;
  } catch (err) {
    if (commandExists('gh')) {
      log?.warn(`git push failed, retrying via gh's git credential helper: ${err.message}`);
      run('gh', ['auth', 'setup-git'], { cwd: root, dryRun, log, allowFailure: true });
      run('git', args, { cwd: root, dryRun, log });
      return true;
    }
    throw err;
  }
}
