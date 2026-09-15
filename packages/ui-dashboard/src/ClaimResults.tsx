import type { ClaimAnalysis } from '@michaelborck/cite-sight-core';
import { claimCsv, claimSuggestionLabel } from '@michaelborck/cite-sight-core/browser';
import { ReviewActions } from './ReviewActions';
import { useContext } from 'react';
import { ReviewContext } from './ReviewActions';
import { REVIEW_LABELS, reviewKey } from '@michaelborck/cite-sight-core/review';

function download(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

export function ClaimResults({ analysis }: { analysis: ClaimAnalysis }) {
  const reviewContext = useContext(ReviewContext);
  const assessments = analysis.findings.map((_finding, index) => reviewContext?.result.reviews?.[reviewKey(reviewContext.result, `claim:${index}`)]);
  return <section className="panel-card">
    <h3>Claim evidence review</h3>
    <p>These are model suggestions, not determinations. Compare the passages and record your judgement. Model: {analysis.model}. Checked: {analysis.checkedAt}.</p>
    {analysis.progress && <p role="status">{analysis.progress.state === 'partial' ? 'Partial run' : 'Completed run'}: {analysis.progress.completed}/{analysis.progress.total} claims saved; {analysis.progress.reused} restored without repeating inference.
      {analysis.progress.state === 'partial' ? ' Unfinished claims have not been assessed. Resume from desktop or CLI.' : ''}</p>}
    {analysis.provenance && <details><summary>Model and runtime versions</summary>
      <p>llama.cpp {analysis.provenance.runtimeVersion}. {analysis.provenance.platform}/{analysis.provenance.arch}.</p>
      <p>Model revision: {analysis.provenance.modelRevision ?? 'custom'}. SHA-256: {analysis.provenance.modelSha256}.</p>
      <p>Runtime SHA-256: {analysis.provenance.runtimeSha256}. Prompt: {analysis.provenance.promptVersion}.</p>
      <p>Parameters: {JSON.stringify(analysis.provenance.parameters)}</p>
    </details>}
    <ul>{analysis.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
    <p>Reports contain student statement excerpts and source quotations.</p>
    <button type="button" onClick={() => download(JSON.stringify({ ...analysis, humanAssessments: assessments.map((assessment) => assessment ?? null) }, null, 2), 'claim-checks.json', 'application/json')}>Export claim JSON</button>{' '}
    <button type="button" onClick={() => download(claimCsv(analysis, assessments), 'claim-checks.csv', 'text/csv;charset=utf-8')}>Export claim CSV</button>
    {analysis.findings.map((finding, index) => <article className="ref-detail" key={finding.id}>
      <h4>{index + 1}. Student claim</h4>
      <blockquote>{finding.claim}</blockquote>
      <p><strong>Model suggestion:</strong> {claimSuggestionLabel(finding.status)}</p>
      <p>{finding.reason}</p>
      <p>Citation: {finding.citation}{finding.referenceIndex === undefined ? '' : `. Reference ${finding.referenceIndex + 1}`}</p>
      {finding.source && <p>Mapped source: {finding.source.fileName}. <small>SHA-256: {finding.source.sha256}</small></p>}
      {finding.evidence.map((evidence, i) => <div key={i}>
        <blockquote>{evidence.quote}</blockquote>
        <p>{evidence.page ? `PDF page ${evidence.page}. ` : ''}Extracted text characters {evidence.start} to {evidence.end}.</p>
      </div>)}
      <p><strong>Human assessment:</strong> {reviewContext?.result.reviews?.[reviewKey(reviewContext.result, `claim:${index}`)]
        ? REVIEW_LABELS[reviewContext.result.reviews[reviewKey(reviewContext.result, `claim:${index}`)].decision] : 'Not assessed'}</p>
      <ReviewActions itemKey={`claim:${index}`} />
    </article>)}
  </section>;
}
