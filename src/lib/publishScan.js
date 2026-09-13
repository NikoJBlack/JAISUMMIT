import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parseDocument } from './bundle.js';
import { scanRefs, classifyRef, toFsPath } from './htmlScan.js';

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === '.DS_Store') continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full, base, out);
    } else {
      out.push(path.relative(base, full));
    }
  }
  return out;
}

/**
 * Walk every *.html page in `publishDir`, extract its real markup (bundled
 * or plain), and classify every href/src/poster/srcset/css-url reference.
 *
 * @returns {{
 *   pages: string[],
 *   allFiles: string[],
 *   findings: Array<{file:string, type:string, value:string, reason?:string}>,
 *   referenced: Set<string>,
 * }}
 */
export function scanPublishDir(publishDir) {
  const allFiles = walk(publishDir).sort();
  const pages = allFiles.filter((f) => f.endsWith('.html')).sort();
  const findings = [];
  const referenced = new Set();

  for (const page of pages) {
    const raw = readFileSync(path.join(publishDir, page), 'utf8');
    const doc = parseDocument(raw);
    const refs = scanRefs(doc.html);

    for (const { attr, value } of refs) {
      const info = classifyRef(value, { manifestKeys: doc.manifestKeys });

      if (info.type === 'file-url') {
        findings.push({ file: page, type: 'file-url', attr, value, reason: 'absolute file:// link' });
        continue;
      }
      if (info.type === 'external' && info.flag === 'error') {
        findings.push({ file: page, type: 'localhost-link', attr, value, reason: 'absolute localhost link' });
        continue;
      }
      if (info.type === 'manifest-ref') {
        if (info.flag) findings.push({ file: page, type: 'unknown-manifest-ref', attr, value, reason: 'src references a manifest asset id not declared in this file' });
        continue;
      }
      if (info.type !== 'relative') continue; // template/scheme/fragment/external(ok): nothing to check

      if (info.flag === 'error' && info.reason === 'stale-dc-html-link') {
        findings.push({ file: page, type: 'stale-dc-html-link', attr, value, reason: 'internal link points at a .dc.html name instead of the clean published filename' });
        continue;
      }

      const fsPath = toFsPath(value);
      const resolved = path.normalize(path.join(path.dirname(page), fsPath));
      referenced.add(resolved);

      if (!existsSync(path.join(publishDir, resolved))) {
        findings.push({ file: page, type: 'missing-asset', attr, value, resolved, reason: 'referenced file does not exist in publish/' });
      }
    }
  }

  return { pages, allFiles, findings, referenced };
}

/** Files that exist under publishDir but are referenced by no page. */
export function findUnreferenced(publishDir, { pages, allFiles, referenced }) {
  const ignore = new Set(['.nojekyll', 'README.md', '.DS_Store']);
  return allFiles.filter((f) => {
    if (pages.includes(f)) return false;
    if (ignore.has(f)) return false;
    return !referenced.has(path.normalize(f));
  });
}
