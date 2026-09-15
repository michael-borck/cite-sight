import { useEffect, useState } from 'react';
import { useStore } from '../store';
import './UpdateNotification.css';

type UpdateState = 'idle' | 'available' | 'downloading' | 'ready';

export function UpdateNotification() {
  const isProcessing = useStore((store) => store.isProcessing);
  const offline = useStore((store) => store.options.offline !== false);
  const [state, setState] = useState<UpdateState>('idle');
  const [version, setVersion] = useState('');
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    window.citeSight?.onUpdateAvailable((info) => {
      setVersion(info.version);
      setState('available');
    });
    window.citeSight?.onUpdateProgress((progress) => {
      setPercent(Math.round(progress.percent));
    });
    window.citeSight?.onUpdateDownloaded(() => {
      setState('ready');
    });
    window.citeSight?.onUpdateError(() => {
      // Silently reset — don't pester the user
      setState('idle');
    });
  }, []);

  if (state === 'idle') return null;

  return (
    <div className="update-notification">
      {state === 'available' && (
        <>
          <span>Version {version} is available.</span>
          <button
            className="update-btn"
            disabled={offline || isProcessing}
            onClick={() => {
              setState('downloading');
              void window.citeSight.downloadUpdate().catch(() => setState('available'));
            }}
          >
            Download
          </button>
          <button className="update-dismiss" onClick={() => setState('idle')}>
            &#10005;
          </button>
        </>
      )}
      {state === 'downloading' && (
        <span>Downloading update... {percent}%</span>
      )}
      {state === 'ready' && (
        <>
          <span>Update ready to install.</span>
          <button
            className="update-btn"
            disabled={isProcessing}
            onClick={() => void window.citeSight.installUpdate().catch(() => setState('ready'))}
          >
            Restart &amp; Install
          </button>
          <button className="update-dismiss" onClick={() => setState('idle')}>
            Later
          </button>
        </>
      )}
    </div>
  );
}
