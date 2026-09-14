import ipaddr from 'ipaddr.js';

/** Only ordinary public unicast addresses may be contacted. */
export function isPublicAddress(address: string): boolean {
  try {
    // process() converts IPv4-mapped IPv6 before classifying it.
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

/** Synchronous URL checks. Node also validates DNS at socket connection time. */
export function isPrivateUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return true;
    const hostname = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
    if (ipaddr.isValid(hostname)) return !isPublicAddress(hostname);
    return !hostname.includes('.') || hostname === 'localhost' ||
      /\.(localhost|local|internal|test|invalid)$/.test(hostname);
  } catch {
    return true;
  }
}
