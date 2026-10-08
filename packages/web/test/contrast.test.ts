// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Guards the shared design tokens against contrast regressions. The palette
// shipped 2.4–3.3:1 text (help text, links, the "Needs review" badge), all below
// the 4.5:1 WCAG AA threshold for body text, and nothing caught it because there
// is no automated contrast check.

// Web, desktop and standalone each ship their own byte-identical copy of
// index.css (separate Vite bundles, no shared stylesheet package). All three are
// checked, so a token fixed in one copy cannot silently stay broken in another.
const COPIES = [
  ['web', resolve(import.meta.dirname, '../src/index.css')],
  ['desktop', resolve(import.meta.dirname, '../../desktop/src/renderer/index.css')],
  ['standalone', resolve(import.meta.dirname, '../../standalone/src/index.css')],
] as const;

const css = readFileSync(COPIES[0][1], 'utf8');

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`token --${name} not found in index.css`);
  return match[1];
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

// Each token against every surface it is actually painted on. A tinted badge
// (status colours) is the tightest case, so that pair is listed explicitly.
const TEXT_TOKENS: { name: string; surfaces: string[] }[] = [
  { name: 'ink', surfaces: ['paper', 'white'] },
  { name: 'ink-soft', surfaces: ['paper', 'white'] },
  { name: 'ink-muted', surfaces: ['paper', 'white'] },
  { name: 'ink-faint', surfaces: ['paper', 'white'] },
  { name: 'accent', surfaces: ['paper', 'white', 'accent-bg'] },
  { name: 'accent-dim', surfaces: ['paper', 'white', 'accent-bg'] },
  { name: 'verified', surfaces: ['paper', 'white', 'verified-bg'] },
  { name: 'likely', surfaces: ['paper', 'white', 'likely-bg'] },
  { name: 'suspicious', surfaces: ['paper', 'white', 'suspicious-bg'] },
  { name: 'notfound', surfaces: ['paper', 'white', 'notfound-bg'] },
  { name: 'neutral', surfaces: ['paper', 'white', 'neutral-bg'] },
  { name: 'amber-dark', surfaces: ['paper', 'white', 'amber-bg'] },
  { name: 'rose', surfaces: ['paper', 'white', 'rose-bg'] },
  { name: 'rose-dark', surfaces: ['paper', 'white', 'rose-bg'] },
];

describe('design token contrast', () => {
  it.each(TEXT_TOKENS)('--$name clears 4.5:1 on $surfaces', ({ name, surfaces }) => {
    const foreground = token(name);
    for (const surface of surfaces) {
      expect(
        contrast(foreground, token(surface)),
        `--${name} (${foreground}) on --${surface} (${token(surface)})`,
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps the focus ring visible against paper and white', () => {
    // The ring used to be a 25%-alpha accent measuring 1.33:1. WCAG 2.4.11 asks
    // for 3:1 on non-text indicators, so the target here is deliberately lower
    // than the text threshold.
    const ring = token('accent-dim');
    for (const surface of ['paper', 'white']) {
      expect(contrast(ring, token(surface)), `focus ring on --${surface}`).toBeGreaterThanOrEqual(3);
    }
  });

  it.each(COPIES)('%s ships the same corrected tokens', (_label, path) => {
    const copy = readFileSync(path, 'utf8');
    for (const { name } of TEXT_TOKENS) {
      expect(copy, `${path} is missing --${name}`).toMatch(new RegExp(`--${name}:`));
    }
    // The corrected palette, spot-checked so a reverted copy fails here.
    expect(copy).toMatch(/--suspicious:\s*#8e6c1e/);
    expect(copy).toMatch(/--shadow-focus:\s*0 0 0 2px var\(--accent-dim\)/);
    expect(copy).not.toMatch(/rgba\(42,157,143,0\.25\)/);
    expect(copy).not.toMatch(/\.btn-primary:disabled\s*\{[^}]*opacity/);
  });

  it('does not signal filter and review state with opacity alone', () => {
    // Reviewed rows and hidden filters were dimmed to 0.4–0.45, which put their
    // labels near 1.2:1 — unreadable rather than recessive. The state has to be
    // carried by text, shape or an outline instead.
    const dashboard = readFileSync(
      resolve(import.meta.dirname, '../../ui-dashboard/src/ResultsDashboard.css'), 'utf8');
    const overview = readFileSync(
      resolve(import.meta.dirname, '../../ui-dashboard/src/Overview/Overview.css'), 'utf8');
    expect(dashboard).not.toMatch(/\.status-chip\.off\s*\{[^}]*opacity/);
    expect(overview).not.toMatch(/\.filter-chip\.off\s*\{[^}]*opacity/);
    expect(dashboard).not.toMatch(/\.ref-row\.dismissed\s*\{\s*opacity/);
    // The replacements have to keep an explicit non-colour signal.
    expect(dashboard).toMatch(/\.status-chip\.off\s*\{[^}]*line-through/);
    expect(overview).toMatch(/\.filter-chip\.off\s*\{[^}]*line-through/);
  });
});