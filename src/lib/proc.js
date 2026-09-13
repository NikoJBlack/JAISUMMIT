import { spawnSync } from 'node:child_process';

function quoteForDisplay(arg) {
  return /[\s"']/.test(arg) ? JSON.stringify(arg) : arg;
}

export function formatCommand(cmd, args) {
  return [cmd, ...args.map(quoteForDisplay)].join(' ');
}

/**
 * Run a command, or just describe it under --dry-run. Throws on non-zero
 * exit unless `allowFailure` is set.
 */
export function run(cmd, args, { cwd, dryRun = false, log, allowFailure = false, env } = {}) {
  const display = formatCommand(cmd, args);
  if (dryRun) {
    log?.step(`[dry-run] ${display}`);
    return { status: 0, stdout: '', stderr: '', dryRun: true };
  }
  log?.step(display);
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    env: env ? { ...process.env, ...env } : process.env,
  });
  if (result.error) {
    if (allowFailure) return { status: 1, stdout: '', stderr: String(result.error), error: result.error };
    throw new Error(`${display} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`${display} exited ${result.status}\n${result.stderr || result.stdout}`);
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

export function commandExists(cmd) {
  const probe = process.platform === 'win32' ? spawnSync('where', [cmd]) : spawnSync('which', [cmd]);
  return probe.status === 0;
}
