// ============================================================
// Manual version check
//
// The standalone HTML can't auto-update — the user replaces the file by
// downloading a newer one. This backs the header button: ask GitHub for the
// latest release, compare it against the version baked in at build time, and
// point the user at the releases page when a newer one exists.
//
// The API is unauthenticated (60 req/hr per IP) — plenty for a manual button,
// and CORS-enabled so it works from a file:// page.
// ============================================================

export const RELEASES_PAGE = 'https://github.com/michael-borck/cite-sight/releases/latest';

const RELEASES_API = 'https://api.github.com/repos/michael-borck/cite-sight/releases/latest';

export type VersionCheck =
  | { state: 'up-to-date'; latest: string }
  | { state: 'update-available'; latest: string }
  | { state: 'error' };

/** True when `latest` is a higher semver than `current` (both "X.Y.Z", no prefix). */
export function isNewerVersion(latest: string, current: string): boolean {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const ln = l[i] || 0;
    const cn = c[i] || 0;
    if (ln !== cn) return ln > cn;
  }
  return false;
}

export async function checkLatestVersion(current: string): Promise<VersionCheck> {
  try {
    const res = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return { state: 'error' };
    const data: unknown = await res.json();
    const tag = (data as { tag_name?: unknown }).tag_name;
    if (typeof tag !== 'string' || !tag) return { state: 'error' };
    const latest = tag.replace(/^v/, '');
    return isNewerVersion(latest, current)
      ? { state: 'update-available', latest }
      : { state: 'up-to-date', latest };
  } catch {
    // Offline, rate-limited, or GitHub unreachable — the button reports the
    // failure and the user can still visit the releases page themselves.
    return { state: 'error' };
  }
}
