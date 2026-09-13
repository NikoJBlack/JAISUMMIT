import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { requireConfig } from '../config.js';
import { parseGithubMd } from '../lib/screenmap.js';
import { parseDocument } from '../lib/bundle.js';
import { scanRefs, classifyRef, rewritePageLinks, toFsPath } from '../lib/htmlScan.js';

/**
 * Rebuild publish/ from sourceDir, driven by github.md's ## Screen map.
 * Until sourceDir is configured (no .dc.html sources exist yet in this
 * project) this is a documented no-op — publish/ is treated as authoritative.
 */
export async function build(root, { log, dryRun = false, only = null } = {}) {
  const config = requireConfig(root);

  if (!config.sourceDir) {
    log?.info('sourceDir is not set in jaipub.config.json — publish/ is being treated as authoritative.');
    log?.info('Once .dc.html sources exist, set "sourceDir" and fill in real Source filenames in github.md, then re-run `jaipub build`.');
    ensureNojekyll(root, config, { dryRun, log });
    return { ok: true, skipped: true, wrote: [] };
  }

  const sourceDir = path.join(root, config.sourceDir);
  const publishDir = path.join(root, config.publishDir);
  const githubMdPath = path.join(root, 'github.md');

  if (!existsSync(githubMdPath)) {
    throw new Error('github.md not found — run `jaipub init` first.');
  }
  const md = parseGithubMd(readFileSync(githubMdPath, 'utf8'));

  const screenMapByBasename = {};
  for (const row of md.screenMap) {
    screenMapByBasename[row.source] = row.published;
  }

  let rows = md.screenMap.filter((r) => r.source && r.source !== 'TBD');
  if (only) {
    rows = rows.filter((r) => r.published === only);
    if (rows.length === 0) {
      throw new Error(`--only ${only}: no matching, source-assigned entry in github.md's Screen map`);
    }
  }

  const wrote = [];
  const skippedNoSource = [];

  for (const row of rows) {
    const sourcePath = path.join(sourceDir, row.source);
    if (!existsSync(sourcePath)) {
      skippedNoSource.push(row.source);
      continue;
    }

    const raw = readFileSync(sourcePath, 'utf8');
    const doc = parseDocument(raw);
    const rewritten = doc.rewrite((html) => rewritePageLinks(html, screenMapByBasename));

    const destPath = path.join(publishDir, row.published);
    log?.step(`${row.source} -> ${config.publishDir}/${row.published}`);
    if (!dryRun) {
      mkdirSync(path.dirname(destPath), { recursive: true });
      writeFileSync(destPath, rewritten);
    }
    wrote.push(row.published);

    copyReferencedAssets(rewritten, sourceDir, publishDir, { dryRun, log });
  }

  for (const s of skippedNoSource) {
    log?.warn(`${s}: no such file in ${config.sourceDir}/, skipped`);
  }

  ensureNojekyll(root, config, { dryRun, log });

  log?.printJson({ ok: true, wrote, skippedNoSource });
  return { ok: true, wrote, skippedNoSource };
}

function copyReferencedAssets(html, sourceDir, publishDir, { dryRun, log }) {
  const doc = parseDocument(html);
  const refs = scanRefs(doc.html);
  for (const { value } of refs) {
    const info = classifyRef(value, { manifestKeys: doc.manifestKeys });
    if (info.type !== 'relative' || info.flag) continue;
    const rel = toFsPath(value);
    if (rel.endsWith('.html')) continue; // page links, not assets
    const from = path.join(sourceDir, rel);
    const to = path.join(publishDir, rel);
    if (!existsSync(from)) continue;
    if (existsSync(to) && filesEqual(from, to)) continue;
    log?.step(`copy asset ${rel}`);
    if (!dryRun) {
      mkdirSync(path.dirname(to), { recursive: true });
      copyFileSync(from, to);
    }
  }
}

function filesEqual(a, b) {
  try {
    return statSync(a).size === statSync(b).size;
  } catch {
    return false;
  }
}

function ensureNojekyll(root, config, { dryRun, log }) {
  const p = path.join(root, config.publishDir, '.nojekyll');
  if (existsSync(p)) return;
  log?.step(`write ${config.publishDir}/.nojekyll`);
  if (!dryRun) writeFileSync(p, '');
}
