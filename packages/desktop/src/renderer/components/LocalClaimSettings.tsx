import { useEffect, useState } from 'react';
import { CLAIM_MODELS } from '@michaelborck/cite-sight-core/browser';
import { ClaimModelPicker } from './ClaimModelPicker';
import { deviceLabel } from '../platform';
import { useStore } from '../store';

export function LocalClaimSettings() {
  const { claimInstallation: status, setClaimInstallation, isProcessing, setProcessing } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const installed = CLAIM_MODELS.find((entry) => entry.id === status?.modelId);
  useEffect(() => {
    void window.citeSight.getClaimInstallation().then(setClaimInstallation).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function action(kind: 'import' | 'remove' | 'calibrate', id?: string) {
    setBusy(true); setProcessing(true); setError('');
    if (kind === 'calibrate' && status) setClaimInstallation({ ...status, phase: 'calibrating' });
    try {
      const updated = kind === 'calibrate' ? await window.citeSight.calibrateClaimModel() : kind === 'import' ? await window.citeSight.importClaimModel(id!)
        : await window.citeSight.removeClaimModel();
      setClaimInstallation(updated);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); setProcessing(false); }
  }

  return <section className="desktop-settings" aria-label="Local claim review settings">
    <h3>Local claim review <strong>(Experimental)</strong></h3>
    <p><strong>Research preview.</strong> Suggests evidence matches for cited statements, running entirely on {deviceLabel()}
      (offline, CPU-only). Suggestions are not judgements — every claim still needs a reviewer decision. There is no
      assessment-ready model yet; evaluate any model on your own assessment examples first.</p>
    <p>{status?.runtimeReady ? `Bundled runtime: llama.cpp ${status.runtimeVersion}.` : status?.error ?? 'Checking bundled runtime...'}</p>
    <ClaimModelPicker disabled={isProcessing} />
    <details>
      <summary>Technical details, offline import and speed sample</summary>
      <p>Model: {installed ? `${installed.name} · ${installed.license} · revision ${installed.revision}` : 'none installed'}.</p>
      {installed && <p>SHA-256: <code>{installed.sha256}</code></p>}
      {installed?.smokeResult && <p>Synthetic smoke test: {installed.smokeResult.correct}/{installed.smokeResult.total} label agreement ·
        {' '}{installed.smokeResult.falseSupport} false support · {installed.smokeResult.falseContradiction} false contradiction.
        Provisional developer-authored cases — not validation for grading.</p>}
      <p>{status?.sampleMsPerClaim ? `Measured CPU sample: ${(status.sampleMsPerClaim / 1000).toFixed(1)} s per short statement. Longer passages take more.` : 'Run a local speed sample to improve batch estimates.'}
        {' '}<button type="button" disabled={busy || isProcessing || !status?.ready} onClick={() => void action('calibrate')}>Measure CPU speed</button></p>
      <p>Already downloaded a model file on another machine? Import it here; it must match the pinned checksum.</p>
      <label>Import for <select disabled={busy || isProcessing} defaultValue={installed?.id} onChange={(event) => { void action('import', event.target.value); }}>
        {CLAIM_MODELS.map((entry) => <option key={entry.id} value={entry.id}>{entry.name.replace(/ · .*/, '')}</option>)}
      </select>{' '}<button type="button" disabled={busy || isProcessing} onClick={() => installed && void action('import', installed.id)}>Choose file...</button></label>
      {' '}<button type="button" disabled={busy || isProcessing || !status?.modelId} onClick={() => void action('remove')}>Remove downloaded models</button>
      {error && <p role="alert">{error}</p>}
    </details>
  </section>;
}
