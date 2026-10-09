// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LandingPage } from '../src/pages/LandingPage';

const MAC_KEY = 'cite-sight-mac-arch';

/**
 * Node 26 exposes an experimental global `localStorage` that is undefined
 * without --localstorage-file. Because vitest's jsdom environment makes
 * `window === globalThis`, it shadows jsdom's own storage for every test in
 * this file — so install an in-memory Storage and point the global at it. This
 * is the same storage the app reads and writes.
 */
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
  } as Storage;
}

let store: Storage;

/**
 * The hero and the download section each render the picker on purpose, so
 * scope every query to the hero to keep these assertions unambiguous.
 */
function hero() {
  return within(document.querySelector('.hero-ctas') as HTMLElement);
}
function heroLink(name: RegExp) {
  return hero().getByRole('link', { name });
}
function heroChip(name: 'Apple silicon' | 'Intel') {
  return hero().getByRole('button', { name });
}

/**
 * macOS ships two builds and the browser cannot be trusted to know which:
 * Safari and Chrome on an Apple silicon Mac deliberately report
 * "Macintosh; Intel Mac OS X". The page therefore detects a *default* and lets
 * the visitor change it, remembering an explicit choice.
 */
function setTouchPoints(value: number) {
  Object.defineProperty(navigator, 'maxTouchPoints', { value, configurable: true });
}

beforeEach(() => {
  store = memoryStorage();
  vi.stubGlobal('localStorage', store);
  // The release-asset lookup hits GitHub; stub it so tests never depend on the
  // network. With no assets the links fall back to the releases page, which is
  // irrelevant to what these tests assert.
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ assets: [], tag_name: '' }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('defaults an Apple silicon Mac to the Apple silicon build', () => {
  setTouchPoints(5);
  render(<LandingPage onNavigate={() => {}} />);
  expect(heroLink(/Download for Mac \(Apple silicon\)/)).toBeDefined();
  expect(hero().getByText('Detected Apple silicon')).toBeDefined();
});

it('defaults an Intel Mac to the Intel build', () => {
  setTouchPoints(0);
  render(<LandingPage onNavigate={() => {}} />);
  expect(heroLink(/Download for Mac \(Intel\)/)).toBeDefined();
});

// Detection is only a guess — an Intel Mac with a touch display reports touch
// points too. An explicit choice must win, permanently.
it('prefers a remembered choice over a fresh detection', () => {
  store.setItem(MAC_KEY, 'x64');
  setTouchPoints(5); // detection would say Apple silicon
  render(<LandingPage onNavigate={() => {}} />);
  expect(heroLink(/Download for Mac \(Intel\)/)).toBeDefined();
  // And it should not claim to have detected anything.
  expect(hero().queryByText(/^Detected/)).toBeNull();
});

it('switches the build in one click and remembers it', async () => {
  const user = userEvent.setup();
  setTouchPoints(0);
  render(<LandingPage onNavigate={() => {}} />);
  await user.click(heroChip('Apple silicon'));
  expect(heroLink(/Download for Mac \(Apple silicon\)/)).toBeDefined();
  expect(store.getItem(MAC_KEY)).toBe('arm64');
  expect(hero().getByText('Downloading the Apple silicon build')).toBeDefined();
});

it('marks the active chip with aria-pressed', () => {
  setTouchPoints(5);
  render(<LandingPage onNavigate={() => {}} />);
  expect(heroChip('Apple silicon').getAttribute('aria-pressed')).toBe('true');
  expect(heroChip('Intel').getAttribute('aria-pressed')).toBe('false');
});

it('survives storage being unavailable', async () => {
  const user = userEvent.setup();
  setTouchPoints(5);
  const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  render(<LandingPage onNavigate={() => {}} />);
  await user.click(heroChip('Intel'));
  // The switch still works for this visit; only persistence is lost.
  expect(heroLink(/Download for Mac \(Intel\)/)).toBeDefined();
  setItem.mockRestore();
});