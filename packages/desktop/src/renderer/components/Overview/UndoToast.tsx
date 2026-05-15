import { useEffect } from 'react';

interface Props {
  message: string;
  onUndo: () => void;
  onExpire: () => void;
  durationMs?: number;
}

export function UndoToast({ message, onUndo, onExpire, durationMs = 5000 }: Props) {
  useEffect(() => {
    const id = setTimeout(onExpire, durationMs);
    return () => clearTimeout(id);
  }, [onExpire, durationMs]);

  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span className="undo-toast-message">{message}</span>
      <button type="button" className="undo-toast-button" onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}
