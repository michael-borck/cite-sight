// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { UpdateNotification } from '../src/renderer/components/UpdateNotification';
import { useStore } from '../src/renderer/store';

vi.hoisted(() => {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
});
afterEach(() => { cleanup(); useStore.getState().setProcessing(false); });
it('disables update downloads offline and installation during claim processing', () => {
  useStore.getState().updateOptions({ offline: true });
  let downloaded = () => {};
  Object.defineProperty(window, 'citeSight', { configurable: true, value: {
    onUpdateAvailable: (callback: (info: { version: string }) => void) => callback({ version: 'test' }),
    onUpdateProgress: vi.fn(), onUpdateError: vi.fn(), onUpdateDownloaded: (callback: () => void) => { downloaded = callback; },
  } });
  render(<UpdateNotification />);
  expect((screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled).toBe(true);
  act(() => { downloaded(); useStore.getState().setProcessing(true); });
  expect((screen.getByRole('button', { name: 'Restart & Install' }) as HTMLButtonElement).disabled).toBe(true);
});
