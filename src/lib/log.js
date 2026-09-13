// Minimal ANSI helpers — no chalk/colorette dependency.
const colorsEnabled = process.stdout.isTTY && !process.env.NO_COLOR;

function wrap(code) {
  return (s) => (colorsEnabled ? `\x1b[${code}m${s}\x1b[0m` : String(s));
}

export const color = {
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  blue: wrap(34),
  cyan: wrap(36),
  gray: wrap(90),
  bold: wrap(1),
};

export function makeLogger({ json = false, verbose = false } = {}) {
  const events = [];

  function record(level, message, data) {
    events.push({ level, message, data });
  }

  return {
    info(message, data) {
      record('info', message, data);
      if (!json) console.log(message);
    },
    step(message, data) {
      record('step', message, data);
      if (!json && verbose) console.log(color.gray('  · ' + message));
    },
    warn(message, data) {
      record('warn', message, data);
      if (!json) console.log(color.yellow('! ' + message));
    },
    error(message, data) {
      record('error', message, data);
      if (!json) console.error(color.red('✗ ' + message));
    },
    success(message, data) {
      record('success', message, data);
      if (!json) console.log(color.green('✓ ' + message));
    },
    json,
    verbose,
    events,
    printJson(extra) {
      if (json) {
        console.log(JSON.stringify({ events, ...extra }, null, 2));
      }
    },
  };
}
