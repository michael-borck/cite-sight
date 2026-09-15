import { analyzePipeline, verifyReferences, withVerifications } from '@michaelborck/cite-sight-core';
import type { ProcessingOptions } from '@michaelborck/cite-sight-core';
import type { FileOutcome } from './reports.js';

export async function retryOutcomes(outcomes: FileOutcome[], options: ProcessingOptions, only: 'all' | 'failed' | 'unavailable'): Promise<FileOutcome[]> {
  const refreshed: FileOutcome[] = [];
  for (const outcome of outcomes) {
    if (outcome.error && only !== 'unavailable') {
      try { refreshed.push({ file: outcome.file, result: await analyzePipeline(outcome.file, options) }); }
      catch (err) { refreshed.push({ file: outcome.file, error: err instanceof Error ? err.message : String(err) }); }
    } else if (outcome.result && only !== 'failed') {
      const result = outcome.result;
      const verifications = [...result.references.verifications];
      for (const [index, verification] of verifications.entries()) {
        if (verification.status !== 'unverified') continue;
        const [fresh] = await verifyReferences([verification.reference], {
          offline: options.offline || result.offline,
          citationStyle: options.citationStyle === 'auto' ? result.references.detectedStyle : options.citationStyle,
          checkDoi: options.checkDoi, checkUrls: options.checkUrls, mailto: options.contactEmail, semanticScholarApiKey: options.semanticScholarApiKey,
          openAlexApiKey: options.openAlexApiKey,
        });
        if (fresh) verifications[index] = fresh;
      }
      refreshed.push({ ...outcome, result: withVerifications(result, verifications) });
    } else refreshed.push(outcome);
  }
  return refreshed;
}
