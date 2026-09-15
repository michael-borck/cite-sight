import { AnalysisSetup } from '@michaelborck/cite-sight-ui';
import { useStore } from '../store';

export function ProcessingOptions() {
  const { options, updateOptions, isProcessing } = useStore();
  return <>
    <label><input type="checkbox" checked={options.offline !== false} disabled={isProcessing}
      onChange={(event) => updateOptions({ offline: event.target.checked })} /> Local-only mode. Disable external lookups, page requests and update checks.</label>
    <p>{options.offline !== false ? 'Reference formatting and in-text matching run locally. Use local claim checks after mapping your source files.' : 'Online by default: verification sends extracted reference details (titles, authors, identifiers, cited URLs) to citation databases. The essay text itself never leaves this device. Tick the box for fully offline checks.'}</p>
    <AnalysisSetup options={options} onChange={updateOptions} disabled={isProcessing} screenshots credentials />
  </>;
}
