import { AnalysisSetup } from '@michaelborck/cite-sight-ui';
import { useStore } from '../store';

export function ProcessingOptions() {
  const { options, updateOptions, isProcessing } = useStore();
  return <AnalysisSetup options={options} onChange={updateOptions} disabled={isProcessing} screenshots credentials />;
}
