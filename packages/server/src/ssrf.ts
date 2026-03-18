/**
 * Re-export SSRF protection from core.
 *
 * The canonical implementation lives in @michaelborck/cite-sight-core
 * where it is used by the URL checker and web source verifier.
 */
export { isPrivateUrl } from '@michaelborck/cite-sight-core';
