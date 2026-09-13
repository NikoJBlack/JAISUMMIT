// Lightweight, dependency-free attribute scanner. We deliberately don't pull
// in a full HTML parser: the real content we scan is a JSON-decoded string
// (see bundle.js), not a DOM, and a regex pass over href/src/poster/srcset
// and CSS url(...) covers every case seen in this project's markup.

const ATTR_RE = /\b(href|src|poster)\s*=\s*"([^"]*)"/gi;
const SRCSET_RE = /\bsrcset\s*=\s*"([^"]*)"/gi;
const CSS_URL_RE = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi;
const STYLE_TAG_RE = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
const STYLE_ATTR_RE = /\bstyle\s*=\s*"([^"]*)"/gi;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SPECIAL_SCHEME_RE = /^(tel|mailto|sms|data):/i;

/** @returns {{attr:string, value:string}[]} every href/src/poster/srcset-entry/css-url found in `html` */
export function scanRefs(html) {
  const refs = [];

  let m;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(html))) {
    refs.push({ attr: m[1].toLowerCase(), value: m[2] });
  }

  SRCSET_RE.lastIndex = 0;
  while ((m = SRCSET_RE.exec(html))) {
    for (const entry of m[1].split(',')) {
      const url = entry.trim().split(/\s+/)[0];
      if (url) refs.push({ attr: 'srcset', value: url });
    }
  }

  // Only look for CSS url(...) inside actual CSS — <style> blocks and
  // style="" attributes — never the whole document. Elsewhere "url(" shows
  // up constantly in plain JavaScript (new URL(...), URL.createObjectURL(...))
  // and those aren't asset references.
  for (const css of extractCss(html)) {
    CSS_URL_RE.lastIndex = 0;
    let cm;
    while ((cm = CSS_URL_RE.exec(css))) {
      if (cm[2]) refs.push({ attr: 'css-url', value: cm[2] });
    }
  }

  return refs;
}

function extractCss(html) {
  const blocks = [];
  let m;
  STYLE_TAG_RE.lastIndex = 0;
  while ((m = STYLE_TAG_RE.exec(html))) blocks.push(m[1]);
  STYLE_ATTR_RE.lastIndex = 0;
  while ((m = STYLE_ATTR_RE.exec(html))) blocks.push(m[1]);
  return blocks;
}

/**
 * Classify one ref value. Callers resolve `relative` values against a
 * publish directory (existence checks belong in the command, not here).
 */
export function classifyRef(value, { manifestKeys = new Set() } = {}) {
  const trimmed = value.trim();

  if (!trimmed) return { type: 'empty' };
  if (trimmed.includes('{{') || trimmed.includes('}}')) return { type: 'template' };
  if (SPECIAL_SCHEME_RE.test(trimmed)) return { type: 'scheme' };
  if (trimmed.startsWith('#')) return { type: 'fragment' };
  if (/^file:\/\//i.test(trimmed)) return { type: 'file-url', flag: 'error' };
  if (/^https?:\/\//i.test(trimmed)) {
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(trimmed);
    return { type: 'external', flag: isLocalhost ? 'error' : null, reason: isLocalhost ? 'localhost' : null };
  }
  if (UUID_RE.test(trimmed)) {
    const known = manifestKeys.has(trimmed.toLowerCase());
    return { type: 'manifest-ref', flag: known ? null : 'error', reason: known ? null : 'unknown-manifest-key' };
  }

  const withoutHashQuery = trimmed.split(/[?#]/)[0];
  if (/\.dc\.html$/i.test(withoutHashQuery)) {
    return { type: 'relative', flag: 'error', reason: 'stale-dc-html-link' };
  }

  return { type: 'relative' };
}

/** Strip a relative ref down to its filesystem path (no hash/query, percent-decoded). */
export function toFsPath(value) {
  const withoutHashQuery = value.split(/[?#]/)[0];
  try {
    return decodeURIComponent(withoutHashQuery);
  } catch {
    return withoutHashQuery;
  }
}

/**
 * Rewrite href/src values that point at a source page name to its clean
 * published name, via `screenMap` ({ sourceBasename -> publishedBasename }).
 * Preserves `#hash` and `?query`; leaves asset refs (poster/srcset/css-url)
 * untouched since the screen map only covers page-to-page navigation.
 */
export function rewritePageLinks(html, screenMap) {
  return html.replace(ATTR_RE, (full, attr, value) => {
    if (attr.toLowerCase() === 'poster') return full;
    const [pathPart, ...rest] = value.split(/([?#].*)$/);
    let decodedPath;
    try {
      decodedPath = decodeURIComponent(pathPart);
    } catch {
      decodedPath = pathPart;
    }
    const basename = decodedPath.split('/').pop();
    const mapped = screenMap[basename];
    if (!mapped) return full;
    const dir = decodedPath.includes('/') ? decodedPath.slice(0, decodedPath.lastIndexOf('/') + 1) : './';
    const suffix = rest.join('');
    return `${attr}="${dir}${mapped}${suffix}"`;
  });
}
