/** Human label for the device the app runs on. Browsers/Electron both expose
 *  the OS in the user agent, so the claim-review wording can say "this Mac",
 *  "this Windows PC" or "this Linux machine" instead of assuming a Mac. */
export function deviceLabel(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  if (ua.includes('windows')) return 'this Windows PC';
  if (ua.includes('mac')) return 'this Mac';
  if (ua.includes('linux')) return 'this Linux machine';
  return 'this device';
}

/** Short form for headings: "Windows", "macOS", "Linux". */
export function osName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  if (ua.includes('windows')) return 'Windows';
  if (ua.includes('mac')) return 'macOS';
  if (ua.includes('linux')) return 'Linux';
  return 'this device';
}
