// Capability manifest for the lens analyser family. Served at GET /manifest.
// Mirrors /manifest.json at the cite-sight repo root (the canonical copy the
// family's table generator reads) — keep the two in sync.
//
// cite-sight is the family's TypeScript member: citation analysis is an explicit
// content interpretation of a document (like conversation-analyser), so
// auto_routable is false — auto-analyser never routes to it automatically.
export const MANIFEST = {
  name: 'cite-sight',
  version: '0.3.6',
  role: 'analyser',
  accepts: ['citations', 'references', 'document'],
  extensions: [] as string[],
  auto_routable: false,
  produces: 'CiteSightReport',
  language: 'typescript',
  pypi: false,
} as const;
