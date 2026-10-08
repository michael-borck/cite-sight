// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';

vi.mock('../src/pages/ToolPage', () => ({ ToolPage: () => <p>tool view</p> }));
vi.mock('../src/pages/LandingPage', () => ({ LandingPage: ({ onNavigate }: { onNavigate?: (page: string) => void }) => (
  <>
    <p>landing view</p>
    <button onClick={() => onNavigate?.('tool')}>Hero CTA</button>
  </>
) }));
vi.mock('../src/pages/AboutPage', () => ({ AboutPage: () => <p>about view</p> }));

class FakeStream {
  static instances: FakeStream[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(readonly url: string) { FakeStream.instances.push(this); }
}

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  FakeStream.instances = [];
  vi.stubGlobal('EventSource', FakeStream);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// A cold visit to /tool must land on the tool page. Before routing existed, a
// refresh returned to the landing page and the session-restore effect in
// ToolPage never mounted, so refresh recovery was unreachable in practice.
it('lands on the tool page for a deep link', () => {
  window.history.replaceState(null, '', '/tool');
  render(<App />);
  expect(screen.getByText('tool view')).toBeDefined();
  expect(window.location.pathname).toBe('/tool');
});

it('lands on the tool page for a trailing-slash deep link', () => {
  window.history.replaceState(null, '', '/tool/');
  render(<App />);
  expect(screen.getByText('tool view')).toBeDefined();
});

it('pushes the path when navigating and follows browser history back', async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByText('landing view')).toBeDefined();
  await user.click(screen.getByRole('button', { name: 'Check Citations' }));
  expect(screen.getByText('tool view')).toBeDefined();
  expect(window.location.pathname).toBe('/tool');
  await user.click(screen.getByRole('button', { name: 'About' }));
  expect(window.location.pathname).toBe('/about');
  expect(screen.getByText('about view')).toBeDefined();
  // Back should land on the tool page, not the landing page.
  window.history.back();
  await waitFor(() => expect(screen.getByText('tool view')).toBeDefined());
  expect(window.location.pathname).toBe('/tool');
});

it('moves focus to the page heading so a page change is announced', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Hero CTA' }));
  const status = screen.getByRole('status');
  expect(status.textContent).toBe('Check citations page');
  expect(document.activeElement).toBe(status);
});

it('exposes a skip link and marks the current nav item', async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(screen.getByRole('link', { name: 'Skip to main content' })).toBeDefined();
  expect(screen.getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBe('page');
  await user.click(screen.getByRole('button', { name: 'About' }));
  expect(screen.getByRole('button', { name: 'About' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('button', { name: 'Home' }).getAttribute('aria-current')).toBeNull();
});

// The brand is the page's <h1>; making it a button keeps the heading level while
// making "go home" reachable by keyboard.
it('keeps the brand as the page heading and makes it keyboard operable', async () => {
  const user = userEvent.setup();
  render(<App />);
  await user.click(screen.getByRole('button', { name: 'Check Citations' }));
  const brand = screen.getByRole('heading', { level: 1, name: /CiteSight/ });
  expect(brand).toBeDefined();
  await user.click(screen.getByRole('button', { name: /CiteSight/ }));
  expect(screen.getByText('landing view')).toBeDefined();
  expect(window.location.pathname).toBe('/');
});