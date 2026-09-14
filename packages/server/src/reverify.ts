import type { ParsedReference, ProcessingOptions } from '@michaelborck/cite-sight-core';

/** Validate public retry requests before invoking document-derived network work. */
export function reverifyInput(body: unknown): { reference: ParsedReference; options: ProcessingOptions } {
  const invalid = (): never => { throw Object.assign(new Error('Provide a valid reference and check options.'), { status: 400 }); };
  if (!body || typeof body !== 'object') return invalid();
  const { reference, options } = body as { reference?: Partial<ParsedReference>; options?: Partial<ProcessingOptions> };
  if (!reference || typeof reference !== 'object' || typeof reference.raw !== 'string' || !reference.raw.trim() || reference.raw.length > 20_000 ||
      typeof reference.title !== 'string' || reference.title.length > 5000 || !Array.isArray(reference.authors) || reference.authors.length > 100 ||
      reference.authors.some((author) => typeof author !== 'string' || author.length > 500) ||
      (reference.year !== null && (!Number.isInteger(reference.year) || reference.year! < 1000 || reference.year! > 3000)) ||
      !['apa', 'mla', 'chicago', 'unknown'].includes(reference.detectedStyle ?? '')) return invalid();
  for (const key of ['doi', 'url', 'journal', 'volume', 'issue', 'pages', 'yearSuffix'] as const) {
    if (reference[key] !== undefined && (typeof reference[key] !== 'string' || reference[key]!.length > 2048)) return invalid();
  }
  return {
    reference: {
      raw: reference.raw, title: reference.title, authors: reference.authors, year: reference.year!,
      detectedStyle: reference.detectedStyle!, doi: reference.doi, url: reference.url, journal: reference.journal,
      volume: reference.volume, issue: reference.issue, pages: reference.pages, yearSuffix: reference.yearSuffix,
    },
    options: {
      citationStyle: ['auto', 'apa', 'mla', 'chicago'].includes(options?.citationStyle ?? '') ? options!.citationStyle! : 'auto',
      checkUrls: options?.checkUrls !== false, checkDoi: options?.checkDoi !== false, checkInText: false, screenshotUrls: false,
    },
  };
}
