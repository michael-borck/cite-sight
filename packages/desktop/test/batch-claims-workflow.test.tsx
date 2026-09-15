// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/renderer/App';
import { useStore } from '../src/renderer/store';
import { sampleResult } from '../../core/test/fixtures/analysis-result';

vi.hoisted(() => { Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: () => null, setItem: () => {}, removeItem: () => {} } }); });
vi.mock('../src/renderer/components/UpdateNotification', () => ({ UpdateNotification: () => null }));
vi.mock('../src/renderer/utils/generatePdfReport', () => ({ downloadPdfReport: vi.fn() }));
vi.mock('../src/renderer/utils/generateCsvReport', () => ({ downloadCsvReport: vi.fn() }));
afterEach(() => { cleanup(); useStore.getState().setProcessing(false); useStore.getState().reset(); });
it('runs mapped documents sequentially and checkpoints each completed result', async () => {
  const paths = ['/one.txt', '/two.txt'];
  const store = useStore.getState(); store.reset(); store.addFiles(paths);
  for (const path of paths) { store.startFile(path, store.options); store.completeFile(path, sampleResult('format_only')); }
  store.setClaimSource(sampleResult().references.references[0].raw, '/source.pdf');
  store.setClaimInstallation({ ready: true, runtimeReady: true, modelId: 'qwen2.5-1.5b-q4km', ramGB: 16, phase: 'idle', received: 0, total: 0 });
  const sequence: string[] = [];
  const bridge = {
    getVersion: async () => 'test', loadDismissals: async () => [], onProgress: () => () => {}, onReference: () => () => {},
    planBatch: vi.fn(async () => ({ mode: 'claims', offline: true, files: paths.map((path) => ({ path, claims: 1, references: 1 })), claims: 2, references: 2, uniqueReferences: 1, scanMs: 1, estimate: { minMs: 10000, maxMs: 20000, basis: 'planning' } })),
    checkClaims: vi.fn(async (path: string) => { sequence.push(path); return sampleResult('format_only'); }),
    saveBatchCheckpoint: vi.fn(async () => { sequence.push('checkpoint'); }),
  };
  Object.defineProperty(window, 'citeSight', { configurable: true, value: bridge });
  const user = userEvent.setup(); render(<App />);
  await user.click(screen.getByRole('button', { name: 'Review claim evidence for mapped documents' }));
  await waitFor(() => expect(bridge.checkClaims).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(useStore.getState().isProcessing).toBe(false));
  expect(sequence.slice(sequence.indexOf('/one.txt'), sequence.indexOf('/two.txt'))).toContain('checkpoint');
  expect(bridge.planBatch).toHaveBeenCalledWith(paths, expect.objectContaining({ claims: true, offline: true }));
  expect(bridge.checkClaims.mock.calls[0][1]).toMatchObject({ sources: [{ reference: 1, path: '/source.pdf' }] });
  expect(screen.getByRole('region', { name: 'Batch runtime estimate' })).toBeDefined();
});
