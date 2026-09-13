import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanRefs, classifyRef, toFsPath, rewritePageLinks } from '../src/lib/htmlScan.js';

test('scanRefs finds href/src/poster/srcset/css-url', () => {
  const html = `
    <a href="./about.html">About</a>
    <img src="pic.jpg" poster="frame.jpg">
    <img srcset="a.jpg 1x, b.jpg 2x">
    <style>.x { background: url('bg.jpg'); }</style>
  `;
  const refs = scanRefs(html);
  const byAttr = (attr) => refs.filter((r) => r.attr === attr).map((r) => r.value);

  assert.deepEqual(byAttr('href'), ['./about.html']);
  assert.deepEqual(byAttr('src'), ['pic.jpg']);
  assert.deepEqual(byAttr('poster'), ['frame.jpg']);
  assert.deepEqual(byAttr('srcset'), ['a.jpg', 'b.jpg']);
  assert.deepEqual(byAttr('css-url'), ['bg.jpg']);
});

test('srcset entries are split on commas and descriptors stripped', () => {
  const refs = scanRefs('<img srcset="hero%402x.jpg 2x,   hero.jpg 1x">');
  assert.deepEqual(
    refs.map((r) => r.value),
    ['hero%402x.jpg', 'hero.jpg']
  );
});

test('classifyRef: template placeholders are skipped, not treated as broken links', () => {
  assert.equal(classifyRef('{{ item.href }}').type, 'template');
  assert.equal(classifyRef('{{ t.icon }}').type, 'template');
});

test('classifyRef: special schemes and fragments are not filesystem paths', () => {
  assert.equal(classifyRef('tel:+13037200000').type, 'scheme');
  assert.equal(classifyRef('mailto:hi@example.com').type, 'scheme');
  assert.equal(classifyRef('#top').type, 'fragment');
});

test('classifyRef: file:// links are flagged', () => {
  const r = classifyRef('file:///Users/me/notes.txt');
  assert.equal(r.type, 'file-url');
  assert.equal(r.flag, 'error');
});

test('classifyRef: localhost is flagged, other external URLs are not', () => {
  assert.equal(classifyRef('http://localhost:3000/dev').flag, 'error');
  assert.equal(classifyRef('https://example.com').flag, null);
});

test('classifyRef: manifest UUID refs are validated against the known key set', () => {
  const known = new Set(['11111111-1111-1111-1111-111111111111']);
  assert.equal(classifyRef('11111111-1111-1111-1111-111111111111', { manifestKeys: known }).flag, null);
  const missing = classifyRef('22222222-2222-2222-2222-222222222222', { manifestKeys: known });
  assert.equal(missing.flag, 'error');
  assert.equal(missing.reason, 'unknown-manifest-key');
});

test('classifyRef: a .dc.html name is flagged as a stale source link', () => {
  const r = classifyRef('./old-page.dc.html');
  assert.equal(r.type, 'relative');
  assert.equal(r.flag, 'error');
  assert.equal(r.reason, 'stale-dc-html-link');
});

test('classifyRef: ordinary relative paths pass through for existence checking', () => {
  assert.deepEqual(classifyRef('./logo%20image.png'), { type: 'relative' });
});

test('toFsPath strips hash/query and percent-decodes', () => {
  assert.equal(toFsPath('./contact.html?ref=home#top'), './contact.html');
  assert.equal(toFsPath('./logo%20image.png'), './logo image.png');
});

test('rewritePageLinks maps source names to published names via the screen map, preserving hash/query', () => {
  const screenMap = {
    'JAI Summit 2027.dc.html': 'summit.html',
    'sponsor.dc.html': 'sponsors.html',
  };
  const html =
    '<a href="./JAI%20Summit%202027.dc.html">Summit</a>' +
    '<a href="./sponsor.dc.html?print=1#top">Sponsors</a>' +
    '<a href="./untouched.html">Untouched</a>' +
    '<img poster="./JAI%20Summit%202027.dc.html">';

  const out = rewritePageLinks(html, screenMap);

  assert.match(out, /href="\.\/summit\.html"/);
  assert.match(out, /href="\.\/sponsors\.html\?print=1#top"/);
  assert.match(out, /href="\.\/untouched\.html"/);
  // poster is an asset attribute, not a page link — must be left alone
  assert.match(out, /poster="\.\/JAI%20Summit%202027\.dc\.html"/);
});
