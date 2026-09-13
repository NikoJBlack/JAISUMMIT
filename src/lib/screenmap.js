// Reads and writes github.md, the sync ledger. Format:
//
//   repo: NikoJBlack/JAISUMMIT
//   branch: main
//   path: .
//
//   ## Last sync
//   - date: 2026-09-13T18:04:00Z
//   - commit: abc1234
//   - notes:
//     - did a thing
//
//   ## Sync history
//   ### 2026-09-01T00:00:00Z (def5678)
//   - earlier thing
//
//   ## Screen map
//   | Source | Published |
//   | --- | --- |
//   | TBD | home.html |

function parseFrontFields(lines) {
  const fields = {};
  for (const line of lines) {
    const m = /^([a-zA-Z_]+):\s*(.*)$/.exec(line.trim());
    if (m) fields[m[1]] = m[2].trim();
  }
  return fields;
}

function splitSections(text) {
  const sections = {};
  let current = 'front';
  sections[current] = [];
  for (const line of text.split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      current = m[1].trim();
      sections[current] = [];
    } else {
      sections[current].push(line);
    }
  }
  return sections;
}

function parseSyncEntry(lines) {
  const entry = { date: null, commit: null, notes: [] };
  let inNotes = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const dm = /^-\s*date:\s*(.+)$/.exec(line);
    const cm = /^-\s*commit:\s*(.+)$/.exec(line);
    if (dm) {
      entry.date = dm[1].trim();
      inNotes = false;
    } else if (cm) {
      entry.commit = cm[1].trim();
      inNotes = false;
    } else if (/^-\s*notes:\s*$/.test(line)) {
      inNotes = true;
    } else if (inNotes && /^-\s+/.test(line)) {
      entry.notes.push(line.replace(/^-\s+/, ''));
    } else if (/^-\s+/.test(line)) {
      entry.notes.push(line.replace(/^-\s+/, ''));
    }
  }
  return entry;
}

function parseHistory(lines) {
  const entries = [];
  let current = null;
  for (const raw of lines) {
    const hm = /^###\s+(.+?)(?:\s+\(([^)]*)\))?\s*$/.exec(raw);
    if (hm) {
      if (current) entries.push(current);
      current = { date: hm[1].trim(), commit: hm[2] ? hm[2].trim() : null, notes: [] };
      continue;
    }
    const line = raw.trim();
    if (current && /^-\s+/.test(line)) {
      current.notes.push(line.replace(/^-\s+/, ''));
    }
  }
  if (current) entries.push(current);
  return entries;
}

function parseScreenMap(lines) {
  const rows = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 2) continue;
    if (cells[0].toLowerCase() === 'source') continue; // header
    if (/^-+$/.test(cells[0].replace(/\s/g, ''))) continue; // separator
    rows.push({ source: cells[0], published: cells[1] });
  }
  return rows;
}

export function parseGithubMd(text) {
  const sections = splitSections(text);
  const front = parseFrontFields(sections.front || []);
  const lastSync = sections['Last sync'] ? parseSyncEntry(sections['Last sync']) : { date: null, commit: null, notes: [] };
  const syncHistory = sections['Sync history'] ? parseHistory(sections['Sync history']) : [];
  const screenMap = sections['Screen map'] ? parseScreenMap(sections['Screen map']) : [];

  return {
    repo: front.repo || null,
    branch: front.branch || null,
    path: front.path || '.',
    lastSync,
    syncHistory,
    screenMap,
  };
}

function renderSyncEntry(entry) {
  const lines = [`- date: ${entry.date || ''}`, `- commit: ${entry.commit || '(none yet)'}`];
  if (entry.notes && entry.notes.length) {
    lines.push('- notes:');
    for (const n of entry.notes) lines.push(`  - ${n}`);
  }
  return lines.join('\n');
}

export function renderGithubMd(data) {
  const out = [];
  out.push(`repo: ${data.repo}`);
  out.push(`branch: ${data.branch}`);
  out.push(`path: ${data.path || '.'}`);
  out.push('');
  out.push('## Last sync');
  out.push(renderSyncEntry(data.lastSync));
  out.push('');
  out.push('## Sync history');
  if (data.syncHistory.length === 0) {
    out.push('(none yet)');
    out.push('');
  } else {
    for (const entry of data.syncHistory) {
      out.push(`### ${entry.date}${entry.commit ? ` (${entry.commit})` : ''}`);
      for (const n of entry.notes) out.push(`- ${n}`);
      out.push('');
    }
  }
  out.push('## Screen map');
  out.push('| Source | Published |');
  out.push('| --- | --- |');
  for (const row of data.screenMap) {
    out.push(`| ${row.source} | ${row.published} |`);
  }
  out.push('');
  return out.join('\n');
}

/** Push the current Last sync into Sync history, then set a new Last sync. */
export function recordSync(data, { date, commit, notes }) {
  const next = { ...data };
  if (data.lastSync && (data.lastSync.date || data.lastSync.commit)) {
    next.syncHistory = [data.lastSync, ...data.syncHistory];
  }
  next.lastSync = { date, commit, notes };
  return next;
}
