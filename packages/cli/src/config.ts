import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

export interface CliConfig { email?: string; style?: 'auto' | 'apa' | 'mla' | 'chicago' }

export function configPath(): string {
  const base = process.env.CITESIGHT_CONFIG_HOME ?? join(process.env.XDG_CONFIG_HOME ?? (process.platform === 'win32' ? process.env.APPDATA ?? homedir() : join(homedir(), '.config')), 'cite-sight');
  return join(base, 'config.json');
}

export function readConfig(): CliConfig {
  const path = configPath();
  if (!existsSync(path)) return {};
  try {
    const data: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    const config = data as CliConfig;
    if (config.email !== undefined) validate('email', config.email);
    if (config.style !== undefined) validate('style', config.style);
    return { email: config.email, style: config.style };
  } catch { throw new Error(`Cannot read settings at ${path}. Use "cite-sight config reset" to restore defaults.`); }
}

function validate(key: string, value?: string): void {
  if (!['email', 'style'].includes(key)) throw new Error('Setting must be email or style. Supply API keys through SEMANTIC_SCHOLAR_API_KEY or OPENALEX_API_KEY.');
  if (value === undefined) return;
  if (key === 'email' && (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) throw new Error('Provide a valid contact email.');
  if (key === 'style' && !['auto', 'apa', 'mla', 'chicago'].includes(value)) throw new Error('Style must be auto, apa, mla or chicago.');
}

export function updateConfig(key: string, value?: string): void {
  validate(key, value);
  const config = { ...readConfig(), [key]: value };
  const path = configPath();
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  try { writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 }); renameSync(temporary, path); }
  finally { rmSync(temporary, { force: true }); }
}

export function resetConfig(): void { rmSync(configPath(), { force: true }); }
