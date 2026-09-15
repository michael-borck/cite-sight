// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClaimSetup } from '../src/renderer/components/ClaimSetup';
import { useStore } from '../src/renderer/store';
import { sampleResult } from '../../core/test/fixtures/analysis-result';

vi.hoisted(() => {
  Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
});
afterEach(() => { cleanup(); useStore.getState().setProcessing(false); useStore.getState().reset(); });

it('maps chosen source files and forces local-only claim checks from desktop', async () => {
  const result = sampleResult(); result.inputSha256 = 'a'.repeat(64);
  const bridge = {
    selectClaimFile: vi.fn(async (kind: string) => `/local/${kind}`),
    checkClaims: vi.fn(async () => ({ ...result, offline: true })), cancelClaims: vi.fn(),
  };
  Object.defineProperty(window, 'citeSight', { configurable: true, value: bridge });
  useStore.getState().updateOptions({ offline: false });
  useStore.getState().setClaimInstallation({ ready: true, runtimeReady: true, modelId: 'qwen3.5-2b-q4km', ramGB: 16, phase: 'idle', received: 0, total: 0 });
  const user = userEvent.setup();
  render(<ClaimSetup path="/local/essay.txt" result={result} />);
  expect(screen.getAllByText(/Experimental/).length).toBeGreaterThan(0);
  await user.click(screen.getByText('Claim evidence review'));
  await user.click(screen.getByRole('button', { name: 'Choose source for reference 1' }));
  await user.click(screen.getByRole('button', { name: 'Review claim evidence locally' }));
  expect(bridge.checkClaims).toHaveBeenCalledWith('/local/essay.txt', expect.objectContaining({
    expectedDocumentHash: result.inputSha256,
    sources: [{ reference: 1, path: '/local/source', referenceText: result.references.references[0].raw }],
  }), expect.objectContaining({ offline: true }));
  expect(bridge.checkClaims.mock.calls[0][1]).not.toHaveProperty('runnerPath');
  expect(useStore.getState().options.offline).toBe(true);
});
