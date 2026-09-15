import type { ClaimAnalysis } from '../types.js';

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const offset = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const hash = (value: unknown): boolean => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function provenance(value: unknown): boolean {
  return object(value) && text(value.runtimeVersion, 100) && hash(value.runtimeSha256) && hash(value.modelSha256) &&
    text(value.platform, 100) && text(value.arch, 100) && text(value.promptVersion, 100) &&
    (value.modelId === undefined || text(value.modelId, 200)) && (value.modelRevision === undefined || text(value.modelRevision, 100)) &&
    object(value.parameters) && text(value.parameters.device, 100) &&
    (value.parameters.reasoning === undefined || ['auto', 'off', 'on'].includes(String(value.parameters.reasoning))) &&
    (value.parameters.chatTemplate === undefined || ['model-default', 'chatml'].includes(String(value.parameters.chatTemplate))) &&
    ['temperature', 'seed', 'contextSize', 'maxTokens'].every((key) => typeof value.parameters === 'object' && value.parameters !== null && Number.isFinite((value.parameters as Record<string, unknown>)[key]));
}
export function isClaimAnalysis(value: unknown): value is ClaimAnalysis {
  return object(value) && value.version === 1 && value.mode === 'local-only' && text(value.model, 1000) &&
    (value.provenance === undefined || provenance(value.provenance)) &&
    (value.progress === undefined || object(value.progress) && ['partial', 'complete'].includes(String(value.progress.state)) &&
      offset(value.progress.completed) && offset(value.progress.total) && value.progress.total <= 200 && value.progress.completed <= value.progress.total &&
      offset(value.progress.reused) && value.progress.reused <= value.progress.completed && Array.isArray(value.findings) && value.findings.length === value.progress.completed &&
      (value.progress.state !== 'complete' || value.progress.completed === value.progress.total)) &&
    (value.timing === undefined || object(value.timing) && offset(value.timing.inferenceMs) && offset(value.timing.inferenceCount)) &&
    text(value.checkedAt, 100) && Number.isFinite(Date.parse(value.checkedAt)) && offset(value.omittedCount) &&
    Array.isArray(value.warnings) && value.warnings.length <= 200 && value.warnings.every((w) => text(w, 4000)) &&
    Array.isArray(value.findings) && value.findings.length <= 200 && value.findings.every((f) => object(f) &&
      text(f.id, 100) && text(f.claim, 100_000) && text(f.citation, 10_000) && offset(f.position) &&
      (f.referenceIndex === undefined || offset(f.referenceIndex)) && text(f.reason, 4000) &&
      ['supported', 'partially_supported', 'contradicted', 'insufficient_evidence', 'unavailable'].includes(String(f.status)) &&
      (f.source === undefined || object(f.source) && text(f.source.fileName, 1000) && typeof f.source.sha256 === 'string' && /^[a-f0-9]{64}$/.test(f.source.sha256)) &&
      Array.isArray(f.evidence) && f.evidence.length <= 4 &&
      (['insufficient_evidence', 'unavailable'].includes(String(f.status)) || f.evidence.length > 0 && f.source !== undefined) &&
      f.evidence.every((e) => object(e) && text(e.quote, 1200) && text(e.passageId, 100) &&
        offset(e.start) && offset(e.end) && e.end - e.start === e.quote.length && (e.page === undefined || offset(e.page) && e.page > 0)));
}
