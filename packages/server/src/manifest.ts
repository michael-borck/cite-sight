// MANIFEST now lives in cite-sight-core (shared by the server and the CLI), so the
// family metadata has one source. Re-exported here so existing imports
// (`./manifest.js`) keep working. Canonical doc copy: /manifest.json at the repo
// root, which the family's table generator reads.
export { MANIFEST } from '@michaelborck/cite-sight-core';
