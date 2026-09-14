import { describe, it, expect } from 'vitest';
import { isPrivateUrl } from '../src/references/ssrf.js';
import { clampText, assertInputSize, MAX_TEXT_CHARS, MAX_INPUT_BYTES } from '../src/extractors/limits.js';

describe('SSRF guard (isPrivateUrl)', () => {
  it('blocks loopback, private, link-local, and metadata addresses', () => {
    for (const url of [
      'http://127.0.0.1/',
      'http://localhost/',
      'http://localhost./',
      'http://app.localhost/',
      'http://redis/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::ffff:169.254.169.254]/',
      'http://[fe80::1]/',
      'http://100.64.0.1/',
      'http://0.1.2.3/',
      'http://10.0.0.5/admin',
      'http://172.16.3.4/',
      'http://192.168.1.1/',
      'http://169.254.169.254/latest/meta-data/', // cloud metadata
      'http://0.0.0.0/',
      'http://[::1]/',
    ]) {
      expect(isPrivateUrl(url), url).toBe(true);
    }
  });

  it('blocks non-http(s) schemes (file://, data:, javascript:)', () => {
    expect(isPrivateUrl('file:///etc/passwd')).toBe(true);
    expect(isPrivateUrl('data:text/html,<script>alert(1)</script>')).toBe(true);
    expect(isPrivateUrl('javascript:alert(1)')).toBe(true);
  });

  it('blocks unparseable URLs (fail closed)', () => {
    expect(isPrivateUrl('not a url')).toBe(true);
    expect(isPrivateUrl('')).toBe(true);
  });

  it('allows ordinary public URLs', () => {
    expect(isPrivateUrl('https://doi.org/10.1/x')).toBe(false);
    expect(isPrivateUrl('https://www.youtube.com/watch?v=abc')).toBe(false);
    expect(isPrivateUrl('http://example.com/page')).toBe(false);
  });
});

describe('ingestion limits', () => {
  it('clamps over-long text to the cap', () => {
    const huge = 'a'.repeat(MAX_TEXT_CHARS + 1000);
    expect(clampText(huge).length).toBe(MAX_TEXT_CHARS);
  });

  it('leaves normal-length text untouched', () => {
    const normal = 'a'.repeat(1000);
    expect(clampText(normal)).toBe(normal);
  });

  it('rejects an oversized input buffer', () => {
    expect(() => assertInputSize(MAX_INPUT_BYTES + 1, 'bomb.docx')).toThrow(/too large/);
  });

  it('accepts a normal-sized input buffer', () => {
    expect(() => assertInputSize(2 * 1024 * 1024, 'paper.pdf')).not.toThrow();
  });
});
