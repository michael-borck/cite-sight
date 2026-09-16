import type { AcademicWork } from '../types.js';
import { httpFetch } from '../httpClient.js';
import { cacheKey, getCached, setCached } from './lookupCache.js';
import { LookupError, reasonFromFetchError, reasonFromStatus } from './lookupError.js';
import { throttle } from './rateLimiter.js';

interface Publication {
  id?: string;
  source?: string;
  title?: string;
  doi?: string;
  pubYear?: string;
  authorList?: { author?: { fullName?: string; lastName?: string; firstName?: string; collectiveName?: string }[] };
  journalInfo?: { journal?: { title?: string }; volume?: string; issue?: string };
  pageInfo?: string;
  abstractText?: string;
  pubTypeList?: { pubType?: string[] };
}

/** Europe PMC's public API needs no key. Send only the reference title. */
export async function searchEuropePmc(title: string): Promise<AcademicWork[]> {
  if (!title.trim()) return [];
  const key = cacheKey('europe-pmc', title);
  const cached = getCached<AcademicWork[]>(key);
  if (cached !== undefined) return cached;
  await throttle('europe_pmc');
  const params = new URLSearchParams({
    query: `TITLE:"${title.replace(/["\\]/g, ' ')}"`, format: 'json', resultType: 'core', pageSize: '5',
  });
  try {
    const response = await httpFetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`, {
      signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'CiteSight/1.0' },
    });
    if (!response.ok) throw new LookupError('europe_pmc', reasonFromStatus(response.status));
    const data = await response.json() as { resultList?: { result?: Publication[] } };
    if (!Array.isArray(data.resultList?.result)) throw new LookupError('europe_pmc', 'unknown', 'Malformed search response');
    const works: AcademicWork[] = data.resultList.result.map((item) => ({
      title: item.title ?? '',
      authors: (item.authorList?.author ?? []).map((author) => author.collectiveName ||
        (author.lastName ? [author.lastName, author.firstName].filter(Boolean).join(', ') : author.fullName ?? '')).filter(Boolean),
      year: /^\d{4}$/.test(item.pubYear ?? '') ? Number(item.pubYear) : null,
      doi: item.doi, source: 'europe_pmc', journal: item.journalInfo?.journal?.title,
      volume: item.journalInfo?.volume, issue: item.journalInfo?.issue, pages: item.pageInfo,
      workType: item.pubTypeList?.pubType?.join('; '),
      abstract: item.abstractText ? item.abstractText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || undefined : undefined,
      url: item.id && item.source ? `https://europepmc.org/article/${encodeURIComponent(item.source)}/${encodeURIComponent(item.id)}` : undefined,
    }));
    setCached(key, works);
    return works;
  } catch (err) {
    if (err instanceof LookupError) throw err;
    throw new LookupError('europe_pmc', reasonFromFetchError(err));
  }
}
