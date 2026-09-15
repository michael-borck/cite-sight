import { useEffect, useState } from 'react';
import { CLAIM_MODELS } from '@michaelborck/cite-sight-core/browser';
import { useStore } from '../store';

export function LocalClaimSettings() {
  const { claimInstallation: status, setClaimInstallation, filePaths, isProcessing, setProcessing } = useStore();
  const [id, setId] = useState(status?.modelId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const model = CLAIM_MODELS.find((entry) => entry.id === id) ?? CLAIM_MODELS[0];
  useEffect(() => {
    void window.citeSight.getClaimInstallation().then(setClaimInstallation).catch((error) => setError(String(error)));
    return window.citeSight.onClaimInstallProgress((progress) => {
      const current = useStore.getState().claimInstallation;
      if (current) setClaimInstallation({ ...current, ...progress });
    });
  }, []);
  async function action(kind: 'download' | 'import' | 'remove' | 'calibrate') {
    setBusy(true); setProcessing(true); setError('');
    if (kind === 'calibrate' && status) setClaimInstallation({ ...status, phase: 'calibrating' });
    try {
      const updated = kind === 'calibrate' ? await window.citeSight.calibrateClaimModel() : kind === 'download' ? await window.citeSight.installClaimModel(id)
        : kind === 'import' ? await window.citeSight.importClaimModel(id) : await window.citeSight.removeClaimModel();
      setClaimInstallation(updated);
    } catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); setProcessing(false); }
  }
  const blocked = busy || isProcessing || filePaths.length > 0;
  return <section className="desktop-settings" aria-label="Local claim review settings">
    <h3>Local claim review</h3>
    <p>{status?.runtimeReady ? `Bundled runtime: llama.cpp ${status.runtimeVersion}. CPU-only inference.` : status?.error ?? 'Checking bundled runtime...'}</p>
    <p>{status?.ready ? `Ready. Saved model: ${CLAIM_MODELS.find((entry) => entry.id === status.modelId)?.name ?? status.modelId}.` : 'Install a model once, then use it offline for every document.'}</p>
    <p>Models suggest evidence matches; they do not determine whether a student's claim is valid. All catalog models are experimental and need evaluation on your assessment examples.</p>
    <table><caption>Qwen 3.5 CPU comparison · 20 synthetic cases on Apple M1 / 16 GB</caption>
      <thead><tr><th>Model</th><th>Label agreement</th><th>Median / p90 per statement</th><th>30 / 100 documents</th></tr></thead>
      <tbody>{CLAIM_MODELS.filter((entry) => entry.cpuBenchmark).map((entry) => <tr key={entry.id}>
        <td>{entry.name}</td><td>{entry.smokeResult?.correct}/{entry.smokeResult?.total}</td>
        <td>{entry.cpuBenchmark!.medianSeconds.toFixed(1)} / {entry.cpuBenchmark!.p90Seconds.toFixed(1)} seconds</td>
        <td>{(entry.cpuBenchmark!.medianSeconds * 600 / 3600).toFixed(1)} / {(entry.cpuBenchmark!.medianSeconds * 2000 / 3600).toFixed(1)} hours</td>
      </tr>)}</tbody>
    </table>
    <p>Batch extrapolation assumes 20 checked statements per document and excludes parsing and provider waits. Longer source passages can take more time. These are benchmark observations, not guaranteed laptop timings or real-world accuracy. Measure your CPU below.</p>
    <label>Model <select value={id} disabled={blocked} onChange={(event) => setId(event.target.value)}>
      <option value="">Choose an experimental model</option>
      {CLAIM_MODELS.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {(entry.bytes / 1e9).toFixed(2)} GB</option>)}
    </select></label>
    {id && <><p>{model.license}. Download: {(model.bytes / 1e9).toFixed(2)} GB. Allow at least {(model.bytes * 1.15 / 1e9).toFixed(2)} GB free disk space. Suggested RAM: {model.suggestedRamGB} GB or more.
      {status ? ` This laptop has about ${status.ramGB.toFixed(0)} GB RAM.` : ''}</p>
    <p>SHA-256: <code>{model.sha256}</code></p></>}
    {id && model.smokeResult && <p>Small synthetic smoke test: {model.smokeResult.correct}/{model.smokeResult.total} label matches,
      {' '}{model.smokeResult.falseSupport} false support suggestions and {model.smokeResult.falseContradiction} false contradiction suggestions.
      These provisional results do not justify grading use. There is no assessment-ready default model.</p>}
    <p>Download contacts Hugging Face for this model only. Clear the document batch first. Local-only mode stays enabled, and analysis is locked while setup runs.</p>
    <button type="button" disabled={blocked || !status?.runtimeReady || !id} onClick={() => void action('download')}>Download and verify model</button>{' '}
    <button type="button" disabled={blocked || !status?.runtimeReady || !id} onClick={() => void action('import')}>Import downloaded model</button>{' '}
    <button type="button" disabled={blocked || !status?.modelId} onClick={() => void action('remove')}>Remove downloaded models</button>
    <p>{status?.sampleMsPerClaim ? `Short CPU sample: ${(status.sampleMsPerClaim / 1000).toFixed(1)} seconds per statement. Longer passages can take more time.` : 'Run a local speed sample to improve batch estimates before opening a folder.'}</p>
    <button type="button" disabled={blocked || !status?.ready} onClick={() => void action('calibrate')}>Measure CPU speed</button>
    {filePaths.length > 0 && <p>Clear or save and close the current batch before model setup.</p>}
    {busy && <div role="status"><p>{status?.phase === 'calibrating' ? 'Measuring CPU speed with a short synthetic statement. Allow up to a minute.' : status?.phase === 'verifying' ? 'Verifying model checksum...' : `Downloaded ${((status?.received ?? 0) / 1e6).toFixed(0)} of ${(model.bytes / 1e6).toFixed(0)} MB`}</p>
      <progress max={model.bytes} value={status?.received ?? 0} aria-label="Model setup progress" />
      <button type="button" onClick={() => void window.citeSight.cancelClaimInstall()}>Cancel setup</button></div>}
    {(error || status?.phase === 'failed') && <p role="alert">{error || status?.error}</p>}
  </section>;
}
