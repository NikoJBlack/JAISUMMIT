import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { check } from './check.js';
import { build } from './build.js';
import { push } from './push.js';
import { deploy } from './deploy.js';
import { parseGithubMd, renderGithubMd, recordSync } from '../lib/screenmap.js';

export async function ship(root, { log, dryRun = false, message = null } = {}) {
  const checkResult = await check(root, { log });
  if (!checkResult.ok) {
    log?.error(`ship aborted at check: ${checkResult.errors.length} error(s)`);
    return { ok: false, step: 'check', ...checkResult };
  }

  const buildResult = await build(root, { log, dryRun });

  const pushResult = await push(root, { log, dryRun, message });

  if (pushResult.committed && !dryRun) {
    updateLedger(root, { buildResult, pushResult, log });
    // Ledger-only follow-up commit, pushed alongside — reuses push()'s own
    // staging/idempotency logic, so a second `ship` with no new content
    // makes no further commit.
    await push(root, { log, dryRun, message: 'jaipub: record sync in github.md' });
  }

  const deployResult = await deploy(root, { log, dryRun, preview: false });

  const result = { ok: true, check: checkResult, build: buildResult, push: pushResult, deploy: deployResult };
  log?.printJson(result);
  return result;
}

function updateLedger(root, { buildResult, pushResult, log }) {
  const githubMdPath = path.join(root, 'github.md');
  const md = parseGithubMd(readFileSync(githubMdPath, 'utf8'));

  const notes = [];
  if (buildResult?.wrote?.length) {
    notes.push(`Rebuilt ${buildResult.wrote.length} page(s) from source: ${buildResult.wrote.slice(0, 4).join(', ')}`);
  }
  if (pushResult?.filesChanged?.length) {
    const files = pushResult.filesChanged.filter((f) => f !== 'github.md');
    if (files.length) notes.push(`Changed: ${files.slice(0, 4).join(', ')}${files.length > 4 ? `, +${files.length - 4} more` : ''}`);
  }
  if (notes.length === 0) notes.push('Published via jaipub ship');

  const next = recordSync(md, {
    date: new Date().toISOString(),
    commit: pushResult.sha,
    notes: notes.slice(0, 4),
  });

  writeFileSync(githubMdPath, renderGithubMd(next));
  log?.step(`updated github.md Last sync (commit ${pushResult.sha?.slice(0, 7)})`);
}
