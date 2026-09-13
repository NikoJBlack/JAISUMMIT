import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { requireConfig } from '../config.js';
import { scanPublishDir, findUnreferenced } from '../lib/publishScan.js';
import { parseGithubMd } from '../lib/screenmap.js';
import { color } from '../lib/log.js';

const FATAL_TYPES = new Set([
  'missing-asset',
  'stale-dc-html-link',
  'file-url',
  'localhost-link',
  'unknown-manifest-ref',
]);

export async function check(root, { log } = {}) {
  const config = requireConfig(root);
  const publishDir = path.join(root, config.publishDir);

  if (!existsSync(publishDir)) {
    throw new Error(`Publish dir not found: ${publishDir}`);
  }

  const scan = scanPublishDir(publishDir);
  const unreferenced = findUnreferenced(publishDir, scan);

  const errors = scan.findings.filter((f) => FATAL_TYPES.has(f.type));
  const warnings = unreferenced.map((f) => ({ type: 'unreferenced', file: f, reason: 'exists in publish/ but is referenced by no page' }));

  // Screen map coverage
  const githubMdPath = path.join(root, 'github.md');
  let screenMapIssue = null;
  if (!existsSync(githubMdPath)) {
    screenMapIssue = 'github.md not found — run `jaipub init` (or `jaipub build`) to create it';
    errors.push({ type: 'screen-map', reason: screenMapIssue });
  } else {
    const md = parseGithubMd(readFileSync(githubMdPath, 'utf8'));
    const published = new Set(md.screenMap.map((r) => r.published));
    const missingFromMap = scan.pages.filter((p) => !published.has(p));
    for (const page of missingFromMap) {
      errors.push({ type: 'screen-map', file: page, reason: 'published page is missing from the ## Screen map table in github.md' });
    }
  }

  log?.info(`Scanned ${scan.pages.length} pages, ${scan.allFiles.length} files total in ${config.publishDir}/`);

  for (const e of errors) {
    log?.error(formatFinding(e));
  }
  for (const w of warnings) {
    log?.warn(formatFinding(w));
  }

  if (errors.length === 0 && warnings.length === 0) {
    log?.success('No issues found.');
  }

  log?.printJson({ ok: errors.length === 0, errors, warnings, pages: scan.pages });

  return { ok: errors.length === 0, errors, warnings, pages: scan.pages };
}

function formatFinding(f) {
  const loc = f.file ? `${f.file}` : '(project)';
  const val = f.value ? ` ${color.cyan(f.value)}` : '';
  return `[${f.type}] ${loc}${val} — ${f.reason}`;
}
