import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findEmbeddedDocuments, findManifestKeys, parseDocument } from '../src/lib/bundle.js';

const PADDING =
  'Padding text so this literal clears the minimum candidate length threshold used by the bundle extractor during tests.';

function bundledFixture(innerHtml) {
  const literal = JSON.stringify(innerHtml + ' ' + PADDING.repeat(2));
  return `<!DOCTYPE html><html><body><script>
    const MANIFEST = {"11111111-1111-1111-1111-111111111111":{"mime":"image/png","compressed":false,"data":"AAAA"}};
    const PAGE_HTML = ${literal};
  </script></body></html>`;
}

test('parseDocument treats an unwrapped plain HTML file as one document', () => {
  const raw = '<html><body><a href="./about.html">About</a></body></html>';
  const doc = parseDocument(raw);
  assert.equal(doc.kind, 'plain');
  assert.equal(doc.html, raw);
  assert.equal(doc.rewrite('<x/>'), '<x/>');
});

test('findEmbeddedDocuments extracts the JSON-escaped page HTML from a bundled export', () => {
  const raw = bundledFixture('<a href="./about.html">About</a>');
  const docs = findEmbeddedDocuments(raw);
  assert.equal(docs.length, 1);
  assert.match(docs[0].html, /href="\.\/about\.html"/);
});

test('findManifestKeys collects declared UUID asset ids', () => {
  const raw = bundledFixture('<img src="11111111-1111-1111-1111-111111111111">');
  const keys = findManifestKeys(raw);
  assert.equal(keys.has('11111111-1111-1111-1111-111111111111'), true);
  assert.equal(keys.size, 1);
});

test('parseDocument.rewrite splices a modified literal back in place, byte-identical elsewhere', () => {
  const raw = bundledFixture('<a href="./about.html">About</a>');
  const doc = parseDocument(raw);
  assert.equal(doc.kind, 'bundled');

  const rewritten = doc.rewrite((html) => html.replace('./about.html', './summit.html'));

  // rewritten is still the raw *file* text: the literal is JSON-escaped, so
  // the quotes around the href value show up backslash-escaped here.
  assert.match(rewritten, /href=\\"\.\/summit\.html\\"/);
  // everything outside the literal is untouched
  assert.match(rewritten, /const MANIFEST = \{"11111111/);
  assert.match(rewritten, /<!DOCTYPE html><html><body><script>/);

  // and the result parses back into the same shape
  const reparsed = parseDocument(rewritten);
  assert.equal(reparsed.kind, 'bundled');
  assert.match(reparsed.html, /href="\.\/summit\.html"/);
});
