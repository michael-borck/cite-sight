import { useEffect, useState } from 'react';
import { durationRange, remainingEstimate } from '@michaelborck/cite-sight-core/browser';
import { useStore } from '../store';

export interface BatchClock { started: number; finished: string[]; ended?: number }
export function BatchRuntime({ clock }: { clock?: BatchClock }) {
  const { plan, batch, activePath, streamingRefs, progress, isProcessing } = useStore();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!isProcessing) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [isProcessing]);
  if (!plan) return null;
  const perFile = plan.mode === 'references' && plan.offline;
  const units = (file: typeof plan.files[number]) => perFile ? 1 : plan.mode === 'claims' ? file.claims : file.references;
  const total = plan.files.reduce((sum, file) => sum + units(file), 0);
  const completed = plan.files.filter((file) => clock?.finished.includes(file.path)).reduce((sum, file) => sum + units(file), 0);
  const activeUnits = perFile ? 0 : plan.mode === 'claims' ? progress?.completed ?? 0 : streamingRefs.length;
  const elapsed = clock ? Math.max(0, (clock.ended ?? now) - clock.started) : 0;
  const restored = plan.mode === 'claims' ? batch.filter((file) => clock?.finished.includes(file.path)).reduce((sum, file) => sum + (file.result?.claims?.progress?.reused ?? 0), 0)
    + (activePath ? progress?.restored ?? 0 : 0) : 0;
  const remaining = clock ? remainingEstimate(Math.max(0, (total || plan.files.length) - restored),
    Math.max(0, completed + (activePath ? activeUnits : 0) - restored), elapsed,
    { ...plan.estimate, minMs: plan.estimate.minMs * Math.max(0, total - restored) / Math.max(1, total), maxMs: plan.estimate.maxMs * Math.max(0, total - restored) / Math.max(1, total) }) : plan.estimate;
  return <section className="desktop-settings" aria-label="Batch runtime estimate">
    <h3>{clock ? 'Batch progress and remaining time' : 'Batch runtime estimate'}</h3>
    <p>{plan.files.length} documents · {plan.references} references · {plan.uniqueReferences} distinct lookup queries · {plan.claims} detected cited statements.</p>
    <p>{clock ? `${clock.finished.length} documents finished. Estimated remaining: ` : 'Estimated run: '}{durationRange(remaining)}. Basis: {remaining.basis === 'observed' ? 'measured speed' : 'broad planning range'}.</p>
    <p>{plan.mode === 'claims' ? 'CPU-only estimate assumes mapped sources. It updates as statements finish; missing sources are not treated as checked evidence.' : plan.offline ? 'Local parsing only; no provider requests.' : 'Repeated queries may use cache. Rate limits, retries and outages can extend this range.'}</p>
    <p>Completed claim results are saved individually; reference runs save completed documents. You can stop after the current document and restore the last batch later. After shutdown, the interrupted claim runs again and validated completed claims are reused. This range is not a deadline.</p>
    <p>Keep the laptop awake and plugged in for unattended runs. Processing pauses while it sleeps.</p>
    {plan.files.some((file) => file.error) && <p role="alert">{plan.files.filter((file) => file.error).length} documents could not be scanned. Their actual runs may fail.</p>}
  </section>;
}
