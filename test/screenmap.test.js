import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseGithubMd, renderGithubMd, recordSync } from '../src/lib/screenmap.js';

const SAMPLE = `repo: NikoJBlack/JAISUMMIT
branch: main
path: .

## Last sync
- date: 2026-09-10T12:00:00.000Z
- commit: abc1234
- notes:
  - did a thing
  - and another

## Sync history
### 2026-09-01T00:00:00.000Z (def5678)
- earlier thing

## Screen map
| Source | Published |
| --- | --- |
| home.dc.html | home.html |
| JAI Summit 2027.dc.html | summit.html |
`;

test('parseGithubMd reads front fields, last sync, history, and the screen map table', () => {
  const md = parseGithubMd(SAMPLE);
  assert.equal(md.repo, 'NikoJBlack/JAISUMMIT');
  assert.equal(md.branch, 'main');
  assert.equal(md.lastSync.commit, 'abc1234');
  assert.deepEqual(md.lastSync.notes, ['did a thing', 'and another']);
  assert.equal(md.syncHistory.length, 1);
  assert.equal(md.syncHistory[0].commit, 'def5678');
  assert.deepEqual(md.screenMap, [
    { source: 'home.dc.html', published: 'home.html' },
    { source: 'JAI Summit 2027.dc.html', published: 'summit.html' },
  ]);
});

test('renderGithubMd -> parseGithubMd round-trips', () => {
  const md = parseGithubMd(SAMPLE);
  const rendered = renderGithubMd(md);
  const reparsed = parseGithubMd(rendered);
  assert.deepEqual(reparsed, md);
});

test('recordSync moves the previous Last sync into Sync history', () => {
  const md = parseGithubMd(SAMPLE);
  const next = recordSync(md, { date: '2026-09-13T18:00:00.000Z', commit: 'ffff000', notes: ['shipped it'] });

  assert.equal(next.lastSync.commit, 'ffff000');
  assert.equal(next.syncHistory.length, 2);
  assert.equal(next.syncHistory[0].commit, 'abc1234'); // the previous Last sync, now first in history
  assert.equal(next.syncHistory[1].commit, 'def5678');
});

test('every published page in a screen map is coverable by lookup', () => {
  const md = parseGithubMd(SAMPLE);
  const published = new Set(md.screenMap.map((r) => r.published));
  assert.ok(published.has('summit.html'));
  assert.ok(!published.has('sponsors.html'));
});
