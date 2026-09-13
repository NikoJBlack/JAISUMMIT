import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const CONFIG_FILE = 'jaipub.config.json';

const DEFAULTS = {
  repo: null,
  branch: 'main',
  domain: null,
  publishDir: 'publish',
  sourceDir: null,
  cloudflare: {
    projectName: null,
    accountId: null,
  },
};

export function loadConfig(root) {
  const file = path.join(root, CONFIG_FILE);
  if (!existsSync(file)) {
    return null;
  }
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  return { ...DEFAULTS, ...parsed, cloudflare: { ...DEFAULTS.cloudflare, ...(parsed.cloudflare || {}) } };
}

export function saveConfig(root, config) {
  const file = path.join(root, CONFIG_FILE);
  writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
  return file;
}

export function requireConfig(root) {
  const config = loadConfig(root);
  if (!config) {
    throw new Error(`No ${CONFIG_FILE} found. Run \`jaipub init\` first.`);
  }
  return config;
}
