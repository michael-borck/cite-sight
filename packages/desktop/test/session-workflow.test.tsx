// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/renderer/App';
import { useStore } from '../src/renderer/store';
import { makeReviewSession } from '@michaelborck/cite-sight-core/session';
import { sampleResult } from '../../core/test/fixtures/analysis-result';

// Node's experimental localStorage getter can shadow jsdom's storage.
vi.hoisted(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } });
});

vi.mock('../src/renderer/components/UpdateNotification', () => ({ UpdateNotification: () => null }));
vi.mock('../src/renderer/utils/generatePdfReport', () => ({ downloadPdfReport: vi.fn() }));
vi.mock('../src/renderer/utils/generateCsvReport', () => ({ downloadCsvReport: vi.fn() }));
afterEach(cleanup);

it('opens a review without original files, records a decision, and saves it without credentials', async () => {
  useStore.getState().reset();
  useStore.getState().updateOptions({ semanticScholarApiKey: 'test-private-key' });
  const session = makeReviewSession([{ path: '/missing-original/assignment.pdf', status: 'complete', result: sampleResult('suspicious') }], useStore.getState().options);
  const bridge = {
    getVersion: vi.fn(async () => 'test'), loadDismissals: vi.fn(async () => []),
    onProgress: vi.fn(() => vi.fn()), onReference: vi.fn(() => vi.fn()),
    openSession: vi.fn(async () => session), saveSession: vi.fn(async () => '/saved/review.json'),
    analyzeFile: vi.fn(), setDismissal: vi.fn(),
  };
  Object.defineProperty(window, 'citeSight', { configurable: true, value: bridge });
  const user = userEvent.setup(); render(<App />);
  await user.click(screen.getByRole('button', { name: 'Open review session' }));
  await screen.findByRole('button', { name: /Needs review.*A study of learning/ });
  expect(bridge.analyzeFile).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: /Needs review.*A study of learning/ }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Record review decision' }), 'acceptable_variation');
  await waitFor(() => expect(screen.getByRole('heading', { name: 'No outstanding review items' })).toBeDefined());
  await user.click(screen.getByRole('button', { name: 'Save review session' }));
  await waitFor(() => expect(bridge.saveSession).toHaveBeenCalled());
  const saved = bridge.saveSession.mock.calls[0] as unknown as [ReturnType<typeof makeReviewSession>];
  expect(Object.values(saved[0].files[0].result!.reviews!)[0]).toMatchObject({ decision: 'acceptable_variation' });
  expect(JSON.stringify(saved)).not.toContain('test-private-key');
});
