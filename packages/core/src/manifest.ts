// Capability manifest for the lens analyser family. Single source of truth for
// cite-sight's family metadata, consumed by the server (GET /manifest) and the CLI
// (`cite-sight manifest`). Keep in sync with /manifest.json at the repo root, which
// the family's table generator reads.
//
// cite-sight is the family's TypeScript member: citation analysis is an explicit
// content interpretation of a document (like conversation-analyser), so
// auto_routable is false — auto-analyser never routes to it automatically.
export const MANIFEST = {
  name: 'cite-sight',
  version: '0.8.1',
  role: 'analyser',
  accepts: ['citations', 'references', 'document'],
  extensions: [] as string[],
  auto_routable: false,
  produces: 'CiteSightReport',
  language: 'typescript',
  pypi: false,
} as const;
