// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  await user.selectOptions(screen.getByRole('combobox', { name: 'Model' }), 'qwen2.5-1.5b-q4km');
  await user.click(screen.getByRole('button', { name: 'Download and verify model' }));
  await waitFor(() => expect(screen.getByText(/Ready. Saved model/)).toBeDefined());
  expect(bridge.installClaimModel).toHaveBeenCalledWith('qwen2.5-1.5b-q4km');
  expect(useStore.getState().options.offline).toBe(true);
});
it('disables model setup after documents are opened', async () => {
  Object.defineProperty(window, 'citeSight', { configurable: true, value: { getClaimInstallation: async () => status, onClaimInstallProgress: () => () => {} } });
  useStore.getState().addFiles(['/private/submission.pdf']);
  render(<LocalClaimSettings />);
  await screen.findByText(/Clear or save and close/);
  expect((screen.getByRole('button', { name: 'Download and verify model' }) as HTMLButtonElement).disabled).toBe(true);
});
it('offers both Qwen 3.5 versions and shows comparison timings before a download', async () => {
  Object.defineProperty(window, 'citeSight', { configurable: true, value: { getClaimInstallation: async () => status, onClaimInstallProgress: () => () => {} } });
  const user = userEvent.setup(); render(<LocalClaimSettings />);
  expect(screen.getByRole('table', { name: /Qwen 3.5 CPU comparison/ })).toBeDefined();
  expect(screen.getByText('9.3 / 9.9 seconds')).toBeDefined();
  expect(screen.getByText('23.6 / 26.6 seconds')).toBeDefined();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Model' }), 'qwen3.5-4b-q4km');
  expect(screen.getByText(/Small synthetic smoke test: 19\/20/)).toBeDefined();
  expect(screen.getByText(/Download: 2.74 GB/)).toBeDefined();
});
