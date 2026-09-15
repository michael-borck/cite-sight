import type { AcademicWork, PublicationCheck } from '../types.js';
import { lookupDoi } from './crossref.js';

/** Keep source identity separate from publication notices. Absence of a notice
 * in Crossref does not certify that a paper has never been retracted. */
export async function checkPublicationUpdates(work: AcademicWork, mailto?: string, allowLookup = true): Promise<PublicationCheck> {
  try {
    const fresh = work.publicationStatusCheckedAt && Date.now() - Date.parse(work.publicationStatusCheckedAt) < 86_400_000;
    const record = fresh ? work : work.doi && allowLookup ? await lookupDoi(work.doi, mailto) : null;
    if (!record?.publicationStatusCheckedAt) return { status: 'not_available', updates: [] };
    return { status: 'checked', updates: record.publicationUpdates ?? [], checkedAt: record.publicationStatusCheckedAt };
  } catch {
    return { status: 'unavailable', updates: [] };
  }
}
