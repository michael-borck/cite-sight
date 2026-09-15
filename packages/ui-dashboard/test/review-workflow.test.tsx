import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultsDashboard } from '../src/ResultsDashboard';
import { AnalysisSetup } from '../src/AnalysisSetup';
import { sampleResult } from '../../core/test/fixtures/analysis-result';

afterEach(cleanup);
it('puts a verified but retracted source in the review list', () => {
  const result = sampleResult('verified');
  result.references.verifications[0].flags = ['retraction_notice'];
  result.references.verifications[0].publicationCheck = { status: 'checked', checkedAt: '2026-09-14T00:00:00Z',
    updates: [{ type: 'retraction', doi: '10.1234/notice', source: 'retraction-watch' }],
  };
  render(<ResultsDashboard results={result} />);
  expect(screen.getByRole('heading', { name: '1 item needs review' })).toBeDefined();
});
it('offers simple setup with technical settings collapsed', () => {
  const changed = vi.fn();
  render(<AnalysisSetup options={{ citationStyle: 'auto', checkUrls: true, checkDoi: true, checkInText: true, screenshotUrls: false }} onChange={changed} />);
  expect(screen.getByRole('combobox', { name: 'Document type' })).toBeDefined();
  expect(screen.getByText('Advanced options').closest('details')?.open).toBe(false);
});
it('records a review decision, updates the summary, and allows undo', async () => {
  const user = userEvent.setup(); const changed = vi.fn();
  render(<ResultsDashboard results={sampleResult('suspicious')} onResultsChange={changed} />);
  await user.click(screen.getByRole('button', { name: /Needs review.*A study of learning/ }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Record review decision' }), 'citation_error');
  await waitFor(() => expect(screen.getByRole('heading', { name: 'No outstanding review items' })).toBeDefined());
  expect(Object.values(changed.mock.lastCall![0].reviews)[0]).toMatchObject({ decision: 'citation_error' });
  await user.click(screen.getByText('Review decisions (1)'));
  await user.click(screen.getByRole('button', { name: 'Undo review' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: '1 item needs review' })).toBeDefined());
});
it('retries unavailable references and updates exported counts', async () => {
  const user = userEvent.setup(); const changed = vi.fn();
  const fresh = sampleResult('verified').references.verifications[0];
  render(<ResultsDashboard results={sampleResult()} onResultsChange={changed} reverify={async () => fresh} />);
  await user.click(screen.getByRole('button', { name: 'Retry 1 unavailable check' }));
  await waitFor(() => expect(changed).toHaveBeenCalled());
  expect(changed.mock.lastCall![0].references).toMatchObject({ verifiedCount: 1, unverifiedCount: 0 });
  expect(screen.queryByRole('button', { name: 'Retry 1 unavailable check' })).toBeNull();
});
it.each(['contradicted', 'supported'] as const)('requires review of a %s suggestion without changing the model verdict', async (status) => {
  const result = sampleResult('format_only'); result.offline = true;
  result.claims = { version: 1, mode: 'local-only', model: 'local.gguf', checkedAt: '2026-09-14T00:00:00Z', warnings: [], omittedCount: 0,
    findings: [{ id: 'claim:0', claim: 'Practice improved recall.', citation: '(Smith, 2020)', position: 0, referenceIndex: 0,
      status, reason: 'The source reports no improvement.', source: { fileName: 'source.pdf', sha256: 'a'.repeat(64) },
      evidence: [{ quote: 'Practice did not improve recall.', passageId: 'p0', page: 2, start: 0, end: 32 }],
    }],
  };
  const changed = vi.fn(); const user = userEvent.setup();
  render(<ResultsDashboard results={result} onResultsChange={changed} />);
  await user.click(screen.getByRole('button', { name: 'Review claim checks (1)' }));
  expect(screen.getByText('Not assessed')).toBeDefined();
  expect(screen.getByText('Human assessment:')).toBeDefined();
  expect(screen.getByText('Practice did not improve recall.')).toBeDefined();
  expect(screen.getByText(/PDF page 2/)).toBeDefined();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Record review decision' }), 'claim_not_supported');
  await waitFor(() => expect(screen.getByRole('heading', { name: 'No outstanding review items' })).toBeDefined());
  expect(changed.mock.lastCall![0].claims.findings[0].status).toBe(status);
  expect(Object.values(changed.mock.lastCall![0].reviews)[0]).toMatchObject({ decision: 'claim_not_supported' });
});
