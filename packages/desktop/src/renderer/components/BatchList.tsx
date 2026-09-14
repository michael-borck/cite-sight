import { reviewCount } from '@michaelborck/cite-sight-core/review';
import { useStore } from '../store';
import './BatchList.css';

export function BatchList({ onRetry }: { onRetry: (paths: string[]) => void }) {
  const { batch, selectedPath, isProcessing, selectFile, progress, activePath, streamingRefs, streamingTotal } = useStore();
  return <aside className="batch-list" aria-label="Documents in this batch">
    <h2>Documents <span>{batch.length}</span></h2>
    <ul>{batch.map((item) => <li key={item.path} className={`batch-file ${item.status} ${selectedPath === item.path ? 'selected' : ''}`}>
      <button type="button" className="batch-select" onClick={() => selectFile(item.path)} aria-current={selectedPath === item.path ? 'true' : undefined} title={item.path}>
        <span aria-hidden="true">{item.status === 'complete' ? '✓' : item.status === 'failed' ? '!' : item.status === 'processing' ? '↻' : '·'}</span>
        <span><strong>{item.path.split(/[\\/]/).pop()}</strong><small>
          {item.status === 'complete' && item.result ? `${reviewCount(item.result)} to review · ${item.result.references.unverifiedCount} unavailable`
            : item.status === 'processing' ? progress?.stage === 'complete' ? 'Finishing document…' : streamingTotal > 0
              ? `Checking reference ${Math.min(streamingRefs.length + 1, streamingTotal)} of ${streamingTotal}` : progress?.message ?? 'Reading document…'
            : item.status === 'failed' ? item.error : 'Waiting'}
        </small></span>
      </button>
      {item.status === 'failed' && <button type="button" className="batch-retry" disabled={isProcessing} onClick={() => onRetry([item.path])}>Retry</button>}
      {activePath === item.path && <progress max={100} value={progress?.progress ?? 0} aria-label={`Progress for ${item.path.split(/[\\/]/).pop()}`} />}
    </li>)}</ul>
  </aside>;
}
