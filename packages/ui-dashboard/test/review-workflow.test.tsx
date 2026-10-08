import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultsDashboard } from '../src/ResultsDashboard';
import { AnalysisSetup } from '../src/AnalysisSetup';
import { sampleResult } from '../../core/test/fixtures/analysis-result';

afterEach(cleanup);
it('announces a recorded review and offers an immediate undo', async () => {
  const user = userEvent.setup(); const changed = vi.fn();
  render(<ResultsDashboard results={sampleResult('suspicious')} onResultsChange={changed} />);
  expect(screen.queryByText(/review recorded/)).toBeNull();
  await user.click(screen.getByRole('button', { name: /Needs review.*A study of learning/ }));
  await user.selectOptions(screen.getByRole('combobox', { name: 'Record review decision' }), 'citation_error');
  // The item leaves the priority list, so the toast is the only signal and the
  // only way back — there is nowhere to undo from once the row is gone.
  expect(await screen.findByText('Reference review recorded.')).toBeDefined();
  await user.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: '1 item needs review' })).toBeDefined());
  expect(Object.values(changed.mock.lastCall![0].reviews)).toEqual([]);
});
it('uses one status vocabulary shared with the CLI and core', async () => {
  const user = userEvent.setup();
  render(<ResultsDashboard results={sampleResult('suspicious')} />);
  // Canonical wording lives in core so the CLI text report, the live view and
  // the dashboard cannot drift into separate vocabularies again.
  expect(screen.getAllByText('Needs review').length).toBeGreaterThan(0);
  expect(screen.queryByText(/Needs Review/)).toBeNull();
  expect(screen.queryByText('[suspicious]')).toBeNull();
  await user.click(screen.getByRole('button', { name: /References/ }));
  expect(screen.getAllByText('Needs review').length).toBeGreaterThan(0);
});
it('describes unmatched citations and bibliography entries separately', async () => {
  const user = userEvent.setup();
  const result = sampleResult('verified');
  result.references.crossReference.unmatchedInText = [{ raw: '(Jones, 2021)', position: 0, context: '' }];
  result.references.crossReference.unmatchedBibliography = [{ raw: 'Brown, K. (2019). Uncited.', position: 0 }];
  render(<ResultsDashboard results={result} />);
  // This total sums both directions, so it must not be labelled "Orphaned",
  // which elsewhere in the UI means an unmatched in-text citation only.
  expect(screen.getByText(/Unmatched \(1 cited, 1 uncited\)/)).toBeDefined();
  await user.click(screen.getByRole('button', { name: /Cross-refs/ }));
  expect(screen.getByText('Orphaned In-Text Citations')).toBeDefined();
});
it('behaves like a dialog: focus moves in, Escape closes, focus returns', async () => {
  const user = userEvent.setup();
  render(<ResultsDashboard results={sampleResult()} />);
  const trigger = screen.getByRole('button', { name: /Help/ });
  await user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Help and about' });
  expect(dialog).toBeDefined();
  // aria-modal used to be declared with no focus trap, no Escape and no restore,
  // so assistive tech was told to hide content that stayed keyboard-reachable.
  expect(dialog.contains(document.activeElement)).toBe(true);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
it('gives each section-help trigger a state and closes on Escape', async () => {
  const user = userEvent.setup();
  render(<ResultsDashboard results={sampleResult()} />);
  await user.click(screen.getByRole('button', { name: /References/ }));
  const trigger = screen.getAllByRole('button', { name: 'What does this mean?' })[0];
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  await user.click(trigger);
  expect(trigger.getAttribute('aria-expanded')).toBe('true');
  await user.keyboard('{Escape}');
  await waitFor(() => expect(trigger.getAttribute('aria-expanded')).toBe('false'));
});
it('does not nest a second main landmark', async () => {
  render(<ResultsDashboard results={sampleResult()} />);
  expect(document.querySelectorAll('main')).toHaveLength(0);
  expect(screen.getByRole('region', { name: 'Citation report' })).toBeDefined();
});
it('exposes sortable column headers to keyboard and assistive tech', async () => {
  const user = userEvent.setup();
  render(<ResultsDashboard results={sampleResult()} />);
  await user.click(screen.getByRole('button', { name: /References/ }));
  const statusHeader = screen.getByRole('columnheader', { name: /^Status/ });
  expect(statusHeader.getAttribute('aria-sort')).toBe('none');
  await user.click(screen.getByRole('button', { name: /^Status/ }));
  expect(screen.getByRole('columnheader', { name: /^Status/ }).getAttribute('aria-sort')).toBe('ascending');
  await user.click(screen.getByRole('button', { name: /^Status/ }));
  expect(screen.getByRole('columnheader', { name: /^Status/ }).getAttribute('aria-sort')).toBe('descending');
  // The score caveat must not live only in a title tooltip.
  expect(screen.getByRole('button', { name: /heuristic score, not a probability/ })).toBeDefined();
});
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
