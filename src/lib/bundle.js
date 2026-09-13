// Understands the "Bundled Page" export format used by this project's .dc.html
// design-canvas exports (and, currently, the already-exported publish/*.html files):
// a static loader shell whose real markup lives as a JSON-escaped JS string
// literal inside a <script> tag, alongside a UUID-keyed asset manifest
// ({ "<uuid>": { mime, compressed, data } }) that the page decodes into blob
// URLs at runtime. Plain, non-bundled HTML is also supported: if no embedded
// string is found, the whole file is treated as one plain document.

// Matches top-level double-quoted JS string literals (handles \" and other
// backslash escapes). Linear scan, safe on multi-MB single-line files.
const STRING_LITERAL_RE = /"(?:[^"\\]|\\.)*"/g;

// Only literals at least this long are worth JSON.parse-testing as markup.
const MIN_CANDIDATE_LENGTH = 200;

const MANIFEST_KEY_RE = /"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})":\s*\{\s*"mime"/gi;

const HTML_SIGNAL_RE = /href\s*=|src\s*=|<a\b|<img\b|<link\b/i;

/**
 * Find embedded page-HTML string literals in a raw bundled file.
 * @returns {{start:number,end:number,html:string}[]} spans, in file order
 */
export function findEmbeddedDocuments(raw) {
  const found = [];
  let m;
  STRING_LITERAL_RE.lastIndex = 0;
  while ((m = STRING_LITERAL_RE.exec(raw))) {
    const literal = m[0];
    if (literal.length < MIN_CANDIDATE_LENGTH) continue;
    let decoded;
    try {
      decoded = JSON.parse(literal);
    } catch {
      continue;
    }
    if (typeof decoded === 'string' && HTML_SIGNAL_RE.test(decoded)) {
      found.push({ start: m.index, end: m.index + literal.length, html: decoded });
    }
  }
  return found;
}

/** Set of manifest asset UUIDs referenced/declared in the raw file. */
export function findManifestKeys(raw) {
  const keys = new Set();
  let m;
  MANIFEST_KEY_RE.lastIndex = 0;
  while ((m = MANIFEST_KEY_RE.exec(raw))) {
    keys.add(m[1].toLowerCase());
  }
  return keys;
}

/**
 * Parse a raw file into a document model that both `check` and `build` share.
 * For a bundled file this exposes the embedded HTML (and lets you rewrite it
 * back in place, splicing a re-encoded literal over the original span). For a
 * plain HTML file it's the whole raw content.
 */
export function parseDocument(raw) {
  const embedded = findEmbeddedDocuments(raw);
  const manifestKeys = findManifestKeys(raw);

  if (embedded.length === 0) {
    return {
      kind: 'plain',
      manifestKeys,
      html: raw,
      rewrite(newHtml) {
        return newHtml;
      },
    };
  }

  // In every real export seen so far there is exactly one embedded document;
  // if a future export ever has more, treat the first as primary but still
  // splice all of them through the same replacer so none are silently dropped.
  return {
    kind: 'bundled',
    manifestKeys,
    html: embedded.map((e) => e.html).join('\n'),
    documents: embedded,
    rewrite(replacer) {
      let out = raw;
      // splice from the end so earlier offsets stay valid
      for (let i = embedded.length - 1; i >= 0; i--) {
        const span = embedded[i];
        const newHtml = replacer(span.html, i);
        const newLiteral = JSON.stringify(newHtml);
        out = out.slice(0, span.start) + newLiteral + out.slice(span.end);
      }
      return out;
    },
  };
}
