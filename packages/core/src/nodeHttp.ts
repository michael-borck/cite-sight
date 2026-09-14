import { lookup } from 'node:dns/promises';
import { Agent } from 'undici';
import type { FetchLike } from './httpClient.js';
import { isPublicAddress } from './references/ssrf.js';

/** Resolve once and pass the checked addresses straight to the socket connector. */
export async function publicAddresses(hostname: string): Promise<{ address: string; family: number }[]> {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error('Refusing to connect to a private or reserved network address');
  }
  return addresses;
}

const dispatcher = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      void publicAddresses(hostname).then((addresses) => {
        const candidates = options.family
          ? addresses.filter(({ family }) => family === options.family)
          : addresses;
        if (!candidates.length) throw new Error('No public address for the requested family');
        if (options.all) callback(null, candidates);
        else callback(null, candidates[0].address, candidates[0].family);
      }).catch((err: Error) => callback(err, '', 0));
    },
  },
});

// Use the ambient fetch so hosts/tests can still replace it. The dispatcher
// checks every new connection, including connections made after DNS changes.
export const nodeFetch: FetchLike = (input, init) =>
  globalThis.fetch(input, { ...init, dispatcher } as unknown as RequestInit);
