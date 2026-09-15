import type { ClaimAnalysis, ClaimStatus, ReviewDecision } from '../types.js';

export interface ClaimAssessmentExport { decision: ReviewDecision; reviewedAt: string }

export function claimSuggestionLabel(status: ClaimStatus): string {
  return { supported: 'Suggested support', partially_supported: 'Possible partial support', contradicted: 'Possible contradiction',
    insufficient_evidence: 'Insufficient evidence', unavailable: 'Unavailable' }[status];
}

export function claimReportLines(analysis: ClaimAnalysis): string[] {
  return [
    `Claim evidence review. Model suggestions require reviewer judgement. Model: ${analysis.model}. Checked: ${analysis.checkedAt}.`,
    ...(analysis.progress ? [`${analysis.progress.state === 'partial' ? 'PARTIAL RUN: unfinished claims have not been assessed' : 'Completed run'}. ${analysis.progress.completed}/${analysis.progress.total} claims saved; ${analysis.progress.reused} reused.`] : []),
    ...(analysis.provenance ? [`Runtime: ${analysis.provenance.runtimeVersion}. Runtime SHA-256: ${analysis.provenance.runtimeSha256}`,
      `Model SHA-256: ${analysis.provenance.modelSha256}. Revision: ${analysis.provenance.modelRevision ?? 'custom'}.`,
      `Prompt: ${analysis.provenance.promptVersion}. Parameters: ${JSON.stringify(analysis.provenance.parameters)}. Platform: ${analysis.provenance.platform}/${analysis.provenance.arch}.`,
    ] : ['Version provenance was not recorded in this older report.']),
    ...analysis.warnings,
    ...analysis.findings.flatMap((finding) => [
      `[${claimSuggestionLabel(finding.status)}] ${finding.claim}`,
      finding.reason,
      ...(finding.source ? [`Source: ${finding.source.fileName}. SHA-256: ${finding.source.sha256}`] : []),
      ...finding.evidence.map((evidence) => `${evidence.page ? `PDF page ${evidence.page}, ` : ''}characters ${evidence.start}-${evidence.end}: "${evidence.quote}"`),
    ]),
  ];
}

export function claimCsv(analysis: ClaimAnalysis, assessments: (ClaimAssessmentExport | undefined)[] = []): string {
  const cell = (value: string | number) => {
    let text = String(value);
    if (/^[\s]*[=+@\-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return ['Statement,Citation,Reference,Source,Source SHA256,Model suggestion,Reason,Evidence,Human assessment,Assessed at,Model,Checked at,Provenance,Run state,Completed claims,Total claims',
    ...analysis.findings.map((f, index) => [f.claim, f.citation, f.referenceIndex === undefined ? '' : f.referenceIndex + 1,
      f.source?.fileName ?? '', f.source?.sha256 ?? '', claimSuggestionLabel(f.status), f.reason, JSON.stringify(f.evidence),
      assessments[index]?.decision ?? 'not_assessed', assessments[index]?.reviewedAt ?? '', analysis.model, analysis.checkedAt, JSON.stringify(analysis.provenance ?? null),
      analysis.progress?.state ?? 'complete', analysis.progress?.completed ?? analysis.findings.length, analysis.progress?.total ?? analysis.findings.length].map(cell).join(',')),
  ].join('\n');
}
