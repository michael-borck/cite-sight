/**
 * SSRF (Server-Side Request Forgery) protection utility.
 *
 * Used by URL checkers to prevent user-uploaded documents from triggering
 * requests to private/internal network addresses.
 */

/**
 * Returns true if the given URL resolves to a private or reserved IP range.
 *
 * Checked ranges:
 *   - 127.0.0.0/8   — loopback
 *   - 10.0.0.0/8    — private
 *   - 172.16.0.0/12 — private
 *   - 192.168.0.0/16 — private
 *   - 169.254.0.0/16 — link-local
 *   - 0.0.0.0
 *   - ::1            — IPv6 loopback
 *   - fc00::/7       — IPv6 unique-local
 */
export function isPrivateUrl(rawUrl: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    // Unparseable URL — treat as private / blocked to be safe.
    return true;
  }

  // Strip IPv6 brackets if present: [::1] → ::1
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  // ---- IPv6 checks --------------------------------------------------------

  // Loopback: ::1
  if (hostname === '::1') {
    return true;
  }

  // Unique-local: fc00::/7  (fc** and fd**)
  if (/^f[cd]/i.test(hostname)) {
    return true;
  }

  // ---- IPv4 checks --------------------------------------------------------

  // Hostname is not a bare IPv4 address — we only check literal IPs here.
  // DNS resolution would require an async lookup; for our purposes checking
  // the literal address (as returned in a URL) is the primary defence.
  const ipv4Match = hostname.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  if (!ipv4Match) {
    return false; // Not a literal IP — allow (DNS-based SSRF is a separate concern)
  }

  const [, a, b, c, d] = ipv4Match.map(Number);

  // Sanity check: all octets must be 0-255
  if ([a, b, c, d].some((o) => o > 255)) {
    return true;
  }

  // 0.0.0.0
  if (a === 0 && b === 0 && c === 0 && d === 0) {
    return true;
  }

  // 127.0.0.0/8 — loopback
  if (a === 127) {
    return true;
  }

  // 10.0.0.0/8 — private
  if (a === 10) {
    return true;
  }

  // 172.16.0.0/12 — private (172.16.x.x – 172.31.x.x)
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }

  // 192.168.0.0/16 — private
  if (a === 192 && b === 168) {
    return true;
  }

  // 169.254.0.0/16 — link-local (APIPA)
  if (a === 169 && b === 254) {
    return true;
  }

  return false;
}
