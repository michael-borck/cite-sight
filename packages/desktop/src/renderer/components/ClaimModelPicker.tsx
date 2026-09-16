import { useState } from 'react';
import { CLAIM_MODELS } from '@michaelborck/cite-sight-core/browser';
import { useStore } from '../store';
import { deviceLabel } from '../platform';

interface Choice { id: string; label: string; note: string }
const CHOICES: Choice[] = [
  { id: 'qwen3.5-2b-q4km', label: 'Faster', note: 'smaller download, missed more nuances in our tests' },
  { id: 'qwen3.5-4b-q4km', label: 'More accurate', note: 'stronger pilot candidate in our tests' },
];
const modelFor = (id: string) => CLAIM_MODELS.find((entry) => entry.id === id) ?? CLAIM_MODELS[0];
const gb = (bytes: number) => (bytes / 1e9).toFixed(2);

/**
 * Shared model setup for local claim review: two plainly labelled choices
 * (Faster / More accurate), a user-initiated download with checksum
 * verification, and progress. The exact model name and SHA-256 stay visible in
 * Technical details and in every report's provenance.
 */
export function ClaimModelPicker({ disabled = false }: { disabled?: boolean }) {
  const { claimInstallation: status, setClaimInstallation } = useStore();
  const [choice, setChoice] = useState(status?.modelId && CHOICES.some((c) => c.id === status.modelId) ? status.modelId : CHOICES[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selected = modelFor(choice);
  const installed = status?.ready ? CHOICES.find((c) => c.id === status.modelId) : undefined;
  const needsDownload = installed?.id !== choice;
  const blocked = disabled || busy || status?.phase === 'downloading' || status?.phase === 'verifying';
  const downloading = status?.phase === 'downloading';

  async function install() {
    setBusy(true); setError('');
    try { setClaimInstallation(await window.citeSight.installClaimModel(choice)); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }

  return <div className="claim-model-picker">
    <p><strong>Experimental research preview.</strong> Claim checking runs entirely on {deviceLabel()} — offline, CPU-only.
      It only <em>suggests</em> evidence matches; every suggestion needs your review. Nothing is uploaded.</p>
    <fieldset disabled={blocked}>
      <legend>Choose a model <span className="hint">(one-time download, verified against a pinned checksum)</span></legend>
      {CHOICES.map((entry) => {
        const model = modelFor(entry.id);
        return <label key={entry.id} style={{ display: 'block', margin: '4px 0' }}>
          <input type="radio" name="claim-model" checked={choice === entry.id} onChange={() => setChoice(entry.id)} />{' '}
          <strong>{entry.label}</strong> — {model.name.replace(/ · .*/, '')} · {gb(model.bytes)} GB
          {model.cpuBenchmark && <> · about {Math.round(model.cpuBenchmark.medianSeconds)} s per claim on our test laptop*</>}
          <br /><small>{entry.note}.</small>
        </label>;
      })}
    </fieldset>
    <p>*Short synthetic examples on an Apple M1 laptop (CPU). Your machine differs, and long source passages take longer.</p>
    {!status?.runtimeReady && <p role="alert">{status?.error ?? 'Checking the bundled runtime...'}</p>}
    {status?.runtimeReady && needsDownload && <button type="button" className="btn btn-primary" disabled={blocked}
      onClick={() => void install()}>{installed ? `Download and switch (~${gb(selected.bytes)} GB)` : `Download and verify model (~${gb(selected.bytes)} GB)`}</button>}
    {status?.runtimeReady && !needsDownload && <p>Ready — <strong>{installed?.label}</strong> model ({modelFor(installed!.id).name.replace(/ · .*/, '')}) installed. Local-only, CPU-only.</p>}
    {downloading && <div role="status">
      <p>Downloaded {((status.received ?? 0) / 1e6).toFixed(0)} of {(selected.bytes / 1e6).toFixed(0)} MB</p>
      <progress max={selected.bytes} value={status.received ?? 0} aria-label="Model download progress" />{' '}
      <button type="button" onClick={() => void window.citeSight.cancelClaimInstall()}>Cancel download</button>
    </div>}
    {status?.phase === 'verifying' && <p role="status">Verifying model checksum...</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
