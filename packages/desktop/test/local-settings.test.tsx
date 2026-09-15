// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalClaimSettings } from '../src/renderer/components/LocalClaimSettings';
import { useStore } from '../src/renderer/store';

vi.hoisted(() => { Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }); });
afterEach(() => { cleanup(); useStore.getState().setProcessing(false); useStore.getState().reset(); });
const status = { runtimeReady: true, ready: false, ramGB: 16, phase: 'idle' as const, received: 0, total: 0, runtimeVersion: 'b8680' };

it('requires an explicit download and remembers the installed model', async () => {
  const bridge = { getClaimInstallation: vi.fn(async () => status), onClaimInstallProgress: () => () => {},
    installClaimModel: vi.fn(async (modelId: string) => ({ ...status, modelId, ready: true })),
  };
  Object.defineProperty(window, 'citeSight', { configurable: true, value: bridge });
  useStore.getState().reset(); useStore.getState().updateOptions({ offline: true });
  const user = userEvent.setup(); render(<LocalClaimSettings />);
  await screen.findByText(/Bundled runtime/);
  expect(bridge.installClaimModel).not.toHaveBeenCalled();
  await user.click(screen.getByRole('radio', { name: /More accurate/ }));
  await user.click(screen.getByRole('button', { name: /Download and verify model/ }));
  await waitFor(() => expect(useStore.getState().claimInstallation?.ready).toBe(true));
  await screen.findByText(/Ready — /);
  expect(bridge.installClaimModel).toHaveBeenCalledWith('qwen3.5-4b-q4km');
  expect(useStore.getState().options.offline).toBe(true);
});
it('offers setup while a batch is open, as long as checks are not running', async () => {
  Object.defineProperty(window, 'citeSight', { configurable: true, value: { getClaimInstallation: async () => status, onClaimInstallProgress: () => () => {} } });
  useStore.getState().addFiles(['/private/submission.pdf']);
  render(<LocalClaimSettings />);
  await screen.findByText(/Bundled runtime/);
  expect((screen.getByRole('button', { name: /Download and verify model/ }) as HTMLButtonElement).disabled).toBe(false);
  act(() => { useStore.getState().setProcessing(true); });
  expect((screen.getByRole('button', { name: /Download and verify model/ }) as HTMLButtonElement).disabled).toBe(true);
});
it('labels the feature experimental and frames the two models by speed and accuracy', async () => {
  const installed = { ...status, modelId: 'qwen3.5-2b-q4km', ready: true };
  Object.defineProperty(window, 'citeSight', { configurable: true, value: { getClaimInstallation: async () => installed, onClaimInstallProgress: () => () => {} } });
  render(<LocalClaimSettings />);
  await screen.findByText(/Bundled runtime/);
  expect(screen.getAllByText(/Experimental/).length).toBeGreaterThan(0);
  expect(screen.getByRole('radio', { name: /Faster — Qwen 3\.5 2B · 1\.28 GB/ })).toBeDefined();
  expect(screen.getByRole('radio', { name: /More accurate — Qwen 3\.5 4B · 2\.74 GB/ })).toBeDefined();
  expect(screen.getByText(/about 9 s per claim/)).toBeDefined();
  expect(screen.getByText(/about 24 s per claim/)).toBeDefined();
  expect(screen.getByText(/Research preview/)).toBeDefined();
  // Provenance stays available in the details disclosure.
  expect(screen.getByText(/SHA-256/)).toBeDefined();
  expect(screen.getByText(/Ready — /).textContent).toContain('Faster');
});
