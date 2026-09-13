import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanPublishDir, findUnreferenced } from '../src/lib/publishScan.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PLAIN_SITE = path.join(here, 'fixtures', 'plain-site');
const BUNDLED_SITE = path.join(here, 'fixtures', 'bundled-site');

function findingsOfType(findings, type) {
  return findings.filter((f) => f.type === type);
}

test('plain-site: finds the missing image and missing srcset entry', () => {
  const scan = scanPublishDir(PLAIN_SITE);
  const missing = findingsOfType(scan.findings, 'missing-asset').map((f) => f.value);
  assert.ok(missing.includes('missing.png'));
  assert.ok(missing.includes('hero%402x.jpg'));
});

test('plain-site: percent-encoded and space-containing filenames resolve correctly', () => {
  const scan = scanPublishDir(PLAIN_SITE);
  const missing = findingsOfType(scan.findings, 'missing-asset').map((f) => f.value);
  assert.ok(!missing.includes('./logo%20image.png'), 'logo%20image.png should resolve to the real "logo image.png" file');
});

test('plain-site: flags a .dc.html link instead of the clean published filename', () => {
  const scan = scanPublishDir(PLAIN_SITE);
  const stale = findingsOfType(scan.findings, 'stale-dc-html-link');
  assert.equal(stale.length, 1);
  assert.equal(stale[0].value, './old-page.dc.html');
});

test('plain-site: flags file:// and localhost links', () => {
  const scan = scanPublishDir(PLAIN_SITE);
  assert.equal(findingsOfType(scan.findings, 'file-url').length, 1);
  assert.equal(findingsOfType(scan.findings, 'localhost-link').length, 1);
});

test('plain-site: does not flag tel:/mailto:/https:// links', () => {
  const scan = scanPublishDir(PLAIN_SITE);
  const values = scan.findings.map((f) => f.value);
  assert.ok(!values.includes('tel:+13037200000'));
  assert.ok(!values.includes('mailto:hi@example.com'));
  assert.ok(!values.includes('https://example.com'));
});

test('plain-site: uploads/unused.jpg is reported unreferenced', () => {
  const scan = scanPublishDir(PLAIN_SITE);
  const unreferenced = findUnreferenced(PLAIN_SITE, scan);
  assert.ok(unreferenced.includes(path.join('uploads', 'unused.jpg')));
});

test('bundled-site: extracts links from the JSON-escaped embedded HTML, not the loader shell', () => {
  const scan = scanPublishDir(BUNDLED_SITE);
  const staleLinks = findingsOfType(scan.findings, 'stale-dc-html-link');
  assert.equal(staleLinks.length, 1);
  assert.equal(staleLinks[0].value, './old.dc.html');
});

test('bundled-site: flags an <img> src referencing a manifest id the file never declares', () => {
  const scan = scanPublishDir(BUNDLED_SITE);
  const unknownRefs = findingsOfType(scan.findings, 'unknown-manifest-ref');
  assert.equal(unknownRefs.length, 1);
  assert.equal(unknownRefs[0].value, '22222222-2222-2222-2222-222222222222');
});

test('bundled-site: a declared manifest id on the same page is not flagged', () => {
  const scan = scanPublishDir(BUNDLED_SITE);
  const flaggedValues = scan.findings.map((f) => f.value);
  assert.ok(!flaggedValues.includes('11111111-1111-1111-1111-111111111111'));
});

test('bundled-site: template placeholders like {{ item.label }} are never treated as links', () => {
  const scan = scanPublishDir(BUNDLED_SITE);
  const flaggedValues = scan.findings.map((f) => f.value);
  assert.ok(!flaggedValues.some((v) => v.includes('{{')));
});

test('bundled-site: flags the loader-shell page\'s file:// and localhost links', () => {
  const scan = scanPublishDir(BUNDLED_SITE);
  assert.equal(findingsOfType(scan.findings, 'file-url').length, 1);
  assert.equal(findingsOfType(scan.findings, 'localhost-link').length, 1);
});
