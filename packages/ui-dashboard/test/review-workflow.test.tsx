import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultsDashboard } from '../src/ResultsDashboard';
import { AnalysisSetup } from '../src/AnalysisSetup';
import { sampleResult } from '../../core/test/fixtures/analysis-result';

afterEach(cleanup);
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
