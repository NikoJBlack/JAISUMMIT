# jaipub

Publish the JAI Summit site (`publish/`) to GitHub and Cloudflare Pages in one command.

No framework, no bundler, zero runtime dependencies — plain Node.js (18+) ESM,
`node:util.parseArgs` for the CLI, and hand-rolled attribute scanning instead
of a full HTML parser (see "How link/asset checking works" below).

## Install

Nothing to install beyond Node 18+. Run it via `node bin/jaipub.js <command>`,
or link it onto your `PATH`:

```bash
npm link
jaipub check
```

## `jaipub init`

Generates `jaipub.config.json` (git-ignored — never commit it) and, if
`github.md` doesn't exist yet, creates it with a screen map covering every
page currently in `publish/`.

It infers what it can from `git remote -v`, `cf/wrangler.toml`, and an
existing `github.md`; pass the rest as flags:

```bash
node bin/jaipub.js init \
  --repo NikoJBlack/JAISUMMIT \
  --branch main \
  --domain majaii.com \
  --cloudflare-project majaii26 \
  --source-dir ../dc-sources   # optional, see below
```

If `.git` doesn't exist yet, `init` creates it and adds `origin` (via `gh`'s
known remote if `gh` is authenticated, else a plain `https://` URL).

## Environment variables

| Variable | Used by | Required for |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `deploy`, `ship` | any real (non `--dry-run`) deploy |
| `CLOUDFLARE_ACCOUNT_ID` | `deploy`, `ship` | only if your Cloudflare login has more than one account |
| `GITHUB_TOKEN` | not read directly | `push` shells out to `git`/`gh`, which read it themselves if you use it instead of an SSH key |

jaipub never writes a token to disk. If a required variable is missing it
fails immediately and names the variable.

## Commands

- **`check`** — preflight, no network writes. Verifies every asset referenced
  by `publish/*.html` actually exists, flags `file://`/`localhost` links and
  any internal link still pointing at a `.dc.html` name, and confirms
  `github.md`'s `## Screen map` covers every published page. Exits non-zero
  on any error (unreferenced files are reported as warnings, not errors).
- **`build`** — regenerates `publish/` from `sourceDir`, per `github.md`'s
  screen map. **Until `sourceDir` is configured, this is a documented
  no-op** — see "Current state" below.
- **`push`** — commits `publish/` + `github.md` and pushes to `branch`. If
  anything *outside* those two paths is dirty, it stops and tells you
  instead of sweeping it into the commit. Idempotent: no diff, no commit.
- **`deploy`** — `wrangler pages deploy publish/ --project-name <name>`
  (via `npx wrangler` if `wrangler` isn't on `PATH`), then polls the
  returned `*.pages.dev` URL until it responds.
- **`ship`** — `check` → `build` → `push` → `deploy`, aborting on the first
  failure. On success it moves the previous `## Last sync` into
  `## Sync history` and records the new one (real timestamp, the commit
  sha that was actually pushed, up to 4 bullets of what changed).
- **`verify`** — fetches every published page and every asset it references
  from `https://<domain>/...`, asserts 200 + non-trivial body, prints a
  pass/fail table, exits non-zero on any failure.

Every command accepts `--dry-run` (prints the exact filesystem ops, git
commands, and API calls without running them), `--verbose`, and `--json`.

## Four common flows

**Rebuild one page** (once `sourceDir` is set):
```bash
node bin/jaipub.js build --only summit.html --dry-run   # see the plan first
node bin/jaipub.js build --only summit.html
```

**Ship everything:**
```bash
node bin/jaipub.js ship -m "Update sponsor tiers"
```

**Preview deploy** (doesn't touch production or `majaii.com`):
```bash
node bin/jaipub.js deploy --preview
```

**Verify production:**
```bash
node bin/jaipub.js verify
```

## Current state: no `.dc.html` sources yet

This project's `.dc.html` design-canvas sources don't exist on disk yet —
`publish/` is being treated as the authoritative content. `jaipub build`
will say so and exit cleanly rather than fail. Once sources exist:

1. Set `"sourceDir"` in `jaipub.config.json`.
2. Fill in the real `.dc.html` filename in each row's `Source` column in
   `github.md`'s `## Screen map` (currently `TBD`).
3. `jaipub build` will then copy + rewrite links for real.

## How link/asset checking works

`publish/*.html` (and, from what's been verified, `.dc.html` exports too)
aren't plain static HTML. Each file is a self-unpacking loader shell — the
real markup is a JSON-escaped JS string literal inside a `<script>` tag,
alongside a UUID-keyed asset manifest (`{"<uuid>": {mime, compressed,
data}}`) decoded into blob URLs at runtime. `src/lib/bundle.js` finds that
embedded string, JSON-decodes it, and hands the real markup to
`src/lib/htmlScan.js` for href/src/poster/srcset/CSS-`url()` scanning — the
same scanner also works unmodified on plain HTML (it just treats the whole
file as the "embedded" document). `build`'s link rewriting works the same
way in reverse: it edits the decoded HTML and re-splices a JSON-re-encoded
literal back into the original file, byte-identical everywhere else.

One limitation worth knowing: a handful of asset paths in this project are
built at runtime from JS string concatenation (e.g. `'./icons/topic-' +
key + '.svg'`) rather than appearing as a literal attribute value. `check`
can't enumerate the possible values of `key` statically, so those aren't
verified — if you add a new topic icon, double-check it manually.

## Tests

```bash
npm test
```

Runs against small fixture sites under `test/fixtures/` (one plain HTML,
one mimicking the bundled export format) — never against the real
`publish/` pages, so tests stay fast and don't depend on production
content.
