import { afterEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { publicAddresses, nodeFetch } from '../src/nodeHttp.js';
import { createServer } from 'node:http';
import { once } from 'node:events';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe('DNS destination validation', () => {
  it('rejects private addresses, including mixed public/private answers', async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: '93.184.216.34', family: 4 }, { address: '127.0.0.1', family: 4 },
    ] as never);
    await expect(publicAddresses('public.example')).rejects.toThrow(/private/);
  });

  it('returns only the exact validated addresses to the socket connector', async () => {
    const answers = [{ address: '93.184.216.34', family: 4 }];
    vi.mocked(lookup).mockResolvedValue(answers as never);
    expect(await publicAddresses('public.example')).toEqual(answers);
    expect(lookup).toHaveBeenCalledOnce();
  });

  it('prevents a hostname resolving to loopback from reaching a real listener', async () => {
    let hits = 0;
    const server = createServer((_req, res) => { hits++; res.end('private'); });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    vi.mocked(lookup).mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);
    try {
      const address = server.address() as { port: number };
      await expect(nodeFetch(`http://public.example:${address.port}/`)).rejects.toThrow();
      expect(hits).toBe(0);
      expect(lookup).toHaveBeenCalled();
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
