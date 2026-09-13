import path from 'node:path';
import { requireConfig } from '../config.js';
import { scanPublishDir } from '../lib/publishScan.js';
import { color } from '../lib/log.js';

function urlFor(domain, relPath) {
  const encoded = relPath
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  return `https://${domain}/${encoded}`;
}

async function fetchOne(url) {
  try {
    const res = await fetch(url, { method: 'GET' });
    const body = await res.text();
    return { url, status: res.status, ok: res.ok && body.trim().length > 0, bodyLength: body.length };
  } catch (err) {
    return { url, status: null, ok: false, error: err.message };
  }
}

export async function verify(root, { log, json = false } = {}) {
  const config = requireConfig(root);
  if (!config.domain) {
    throw new Error('No `domain` configured in jaipub.config.json.');
  }
  const publishDir = path.join(root, config.publishDir);
  const scan = scanPublishDir(publishDir);

  const targets = [
    ...scan.pages.map((p) => urlFor(config.domain, p)),
    ...[...scan.referenced].filter((f) => !f.endsWith('.html')).map((f) => urlFor(config.domain, f)),
  ];

  const results = [];
  for (const url of targets) {
    results.push(await fetchOne(url));
  }

  const failed = results.filter((r) => !r.ok);

  if (!json) {
    const width = Math.max(...results.map((r) => r.url.length), 10);
    for (const r of results) {
      const status = r.ok ? color.green('PASS') : color.red('FAIL');
      const detail = r.error ? r.error : `${r.status}${r.bodyLength != null ? `, ${r.bodyLength}b` : ''}`;
      log?.info(`${status}  ${r.url.padEnd(width)}  ${detail}`);
    }
    log?.info(`${results.length - failed.length}/${results.length} passed`);
  }

  log?.printJson({ ok: failed.length === 0, results });
  return { ok: failed.length === 0, results };
}
