import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_PASTE_CHARS, referencesFile, responseJson, uploadDocument, pollJob } from '../src/utils/analysisApi';

afterEach(() => vi.unstubAllGlobals());
describe('web input and requests', () => {
  it('turns pasted references into a source list without duplicating a heading', async () => {
    expect(await referencesFile('Smith, J. (2020). A study.').text()).toMatch(/^References\n\nSmith/);
    expect(await referencesFile('## References\n\nSmith, J. (2020). A study.').text()).toMatch(/^## References/);
    expect(() => referencesFile(' ')).toThrow(/at least/);
    expect(() => referencesFile('x'.repeat(MAX_PASTE_CHARS + 1))).toThrow(/characters/);
  });
  it('shows the server error message instead of raw JSON', async () => {
    await expect(responseJson(new Response(JSON.stringify({ error: 'This file is too large.' }), { status: 413 }))).rejects.toThrow('This file is too large.');
  });
  it('passes the reference-list choice and disabled checks to the server', async () => {
    const fetch = vi.fn(async () => new Response('{"status":"queued","jobId":"abc"}'));
    vi.stubGlobal('fetch', fetch);
    await uploadDocument(referencesFile('Smith (2020). Work.'), { documentType: 'reference-list', citationStyle: 'auto', checkInText: false, checkUrls: false, checkDoi: false, screenshotUrls: false }, new AbortController().signal);
    const form = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(form.get('documentType')).toBe('reference-list');
    expect(form.get('checkInText')).toBe('false');
  });
  it('stops polling when the user cancels', async () => {
    const controller = new AbortController(); controller.abort();
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(pollJob('old-job', controller.signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
