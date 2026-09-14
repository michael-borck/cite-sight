// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolPage } from '../src/pages/ToolPage';
import { uploadDocument, retryReference } from '../src/utils/analysisApi';
import { RECOVERY_KEY } from '../src/utils/recovery';
import { sampleResult } from '../../core/test/fixtures/analysis-result';

vi.mock('../src/utils/analysisApi', async (original) => ({ ...await original<object>(), uploadDocument: vi.fn(), retryReference: vi.fn() }));
vi.mock('../src/utils/generatePdfReport', () => ({ downloadPdfReport: vi.fn() }));
vi.mock('../src/utils/generateCsvReport', () => ({ downloadCsvReport: vi.fn() }));

class FakeStream {
  static instances: FakeStream[] = [];
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();
  constructor(readonly url: string) { FakeStream.instances.push(this); }
  emit(value: object) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
const options = { citationStyle: 'auto', checkUrls: true, checkDoi: true, checkInText: true, screenshotUrls: false };
beforeEach(() => {
  sessionStorage.clear(); FakeStream.instances = [];
  vi.stubGlobal('EventSource', FakeStream);
  vi.mocked(uploadDocument).mockReset().mockResolvedValue({ status: 'queued', jobId: 'job-123' });
  vi.mocked(retryReference).mockReset().mockResolvedValue(sampleResult('verified').references.verifications[0]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('checks pasted references and persists a retried result for refresh recovery', async () => {
  const user = userEvent.setup(); render(<ToolPage />);
  await user.click(screen.getByRole('tab', { name: 'Paste references' }));
  await user.type(screen.getByLabelText(/Paste your references/), 'Smith, J. (2020). A study of learning.');
  await user.click(screen.getByRole('button', { name: 'Check citations' }));
  await waitFor(() => expect(FakeStream.instances).toHaveLength(1));
  expect(vi.mocked(uploadDocument).mock.calls[0][1]).toMatchObject({ documentType: 'reference-list', checkInText: false });
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();
  await act(async () => FakeStream.instances[0].emit({ type: 'complete', result: sampleResult(), expiresAt }));
  await user.click(screen.getByRole('button', { name: 'Retry 1 unavailable check' }));
  await waitFor(() => expect(JSON.parse(sessionStorage.getItem(RECOVERY_KEY)!).result.references.verifiedCount).toBe(1));
  expect(sessionStorage.getItem(RECOVERY_KEY)).not.toContain('Private assignment text.');
  cleanup(); render(<ToolPage />);
  await screen.findByText('Restored your report and review decisions from this tab.');
  expect(FakeStream.instances).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Retry 1 unavailable check' })).toBeNull();
});

it('reconnects to a queued job after a refresh', async () => {
  sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, jobId: 'saved-job', fileName: 'assignment.pdf', options }));
  render(<ToolPage />);
  await waitFor(() => expect(FakeStream.instances[0]?.url).toBe('/api/stream/saved-job'));
  await act(async () => FakeStream.instances[0].emit({ type: 'complete', result: sampleResult('verified'), expiresAt: new Date(Date.now() + 3600_000).toISOString() }));
  expect(await screen.findByRole('heading', { name: 'assignment.pdf' })).toBeDefined();
});

it('ignores late results from a cancelled job when a new check starts', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
  const user = userEvent.setup(); render(<ToolPage />);
  await user.click(screen.getByRole('tab', { name: 'Paste references' }));
  await user.type(screen.getByLabelText(/Paste your references/), 'Smith, J. (2020). A study.');
  await user.click(screen.getByRole('button', { name: 'Check citations' }));
  await waitFor(() => expect(FakeStream.instances).toHaveLength(1));
  const old = FakeStream.instances[0];
  await user.click(screen.getByRole('button', { name: 'Cancel / stop watching' }));
  vi.mocked(uploadDocument).mockResolvedValue({ status: 'queued', jobId: 'new-job' });
  await user.click(screen.getByRole('button', { name: 'Check citations' }));
  await waitFor(() => expect(FakeStream.instances).toHaveLength(2));
  await act(async () => old.emit({ type: 'complete', result: sampleResult('suspicious') }));
  expect(screen.queryByRole('button', { name: 'Download PDF' })).toBeNull();
  expect(JSON.parse(sessionStorage.getItem(RECOVERY_KEY)!).jobId).toBe('new-job');
});
