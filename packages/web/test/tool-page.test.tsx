// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolPage } from '../src/pages/ToolPage';
import { App } from '../src/App';
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
  window.history.replaceState(null, '', '/');
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

// Without routing, reloading dropped the visitor on the landing page, so the
// restore effect never ran and refresh recovery could not actually be reached.
it('restores a completed report when the tab is reloaded on /tool', async () => {
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();
  sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({
    version: 1, fileName: 'assignment.pdf', options,
    result: sampleResult('verified'), expiresAt,
  }));
  window.history.replaceState(null, '', '/tool');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'assignment.pdf' })).toBeDefined();
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDefined();
});

it('restores a queued check when the tab is reloaded on /tool', async () => {
  sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ version: 1, jobId: 'saved-job', fileName: 'assignment.pdf', options }));
  window.history.replaceState(null, '', '/tool');
  render(<App />);
  expect(FakeStream.instances[0]?.url).toBe('/api/stream/saved-job');
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

// The hosted checker is the only surface that uploads the document to a server.
// The disclosure existed in the wording module and was never rendered.
it('discloses the hosted limits before upload and can be dismissed', async () => {
  const user = userEvent.setup(); render(<ToolPage />);
  expect(screen.getByText(/sends your upload to this server and reference metadata to citation databases/)).toBeDefined();
  expect(screen.queryByText(/share server-side API quotas/)).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Dismiss these notices' }));
  expect(screen.queryByText(/sends your upload to this server/)).toBeNull();
});

it('clears the selected file without starting a run', async () => {
  const user = userEvent.setup(); render(<ToolPage />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, new File(['refs'], 'essay.pdf', { type: 'application/pdf' }));
  expect(screen.getByText(/essay\.pdf · /)).toBeDefined();
  await user.click(screen.getByRole('button', { name: 'Remove file' }));
  expect(screen.queryByRole('button', { name: 'Remove file' })).toBeNull();
  expect(screen.getByText('Drop a document here or click to browse')).toBeDefined();
});

// Without the queue the server analyses inside the POST, so there is no stream.
// The stepper replaces the bare progress element so the wait is explained.
it('shows staged progress instead of an indeterminate bar when no queue is used', async () => {
  const user = userEvent.setup();
  let release!: (value: unknown) => void;
  vi.mocked(uploadDocument).mockReset().mockReturnValue(new Promise((resolve) => { release = resolve; }));
  render(<ToolPage />);
  await user.click(screen.getByRole('tab', { name: 'Paste references' }));
  await user.type(screen.getByLabelText(/Paste your references/), 'Smith, J. (2020). A study.');
  await user.click(screen.getByRole('button', { name: 'Check citations' }));
  expect(await screen.findByText('Extract')).toBeDefined();
  expect(screen.getByText('Cross-ref')).toBeDefined();
  expect(document.querySelector('progress')).toBeNull();
  await act(async () => release({ status: 'complete', result: sampleResult(), expiresAt: new Date(Date.now() + 3600_000).toISOString() }));
});
