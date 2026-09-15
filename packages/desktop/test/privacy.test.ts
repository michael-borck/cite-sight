import { afterEach, expect, it } from 'vitest';
import { allowRendererRequest, desktopTask, isLocalOnly, onlineOperation, setLocalOnly, setDocumentsOpen, setupOperation } from '../src/main/privacy';

afterEach(() => { setLocalOnly(true); setDocumentsOpen(false); });
it('allows an explicit setup download before documents, while keeping local-only enabled', async () => {
  setLocalOnly(true);
  await setupOperation(async () => {
    expect(isLocalOnly()).toBe(true);
    await expect(desktopTask(true, async () => {})).rejects.toThrow(/Another/);
    expect(() => setDocumentsOpen(true)).toThrow(/Finish model setup/);
  });
  setDocumentsOpen(true);
  await expect(setupOperation(async () => {})).rejects.toThrow(/Clear the document/);
});
it('blocks renderer HTTP and websockets in packaged local-only mode', () => {
  setLocalOnly(true);
  expect(allowRendererRequest('https://example.org/leak', false)).toBe(false);
  expect(allowRendererRequest('wss://example.org/leak', false)).toBe(false);
  expect(allowRendererRequest('file:///app/index.html', false)).toBe(true);
  expect(allowRendererRequest('http://localhost:5173', true)).toBe(true);
  expect(allowRendererRequest('http://localhost:8080', true)).toBe(false);
});
it('blocks updates and mode changes throughout a local claim run', async () => {
  await desktopTask(true, async () => {
    expect(isLocalOnly()).toBe(true);
    expect(() => setLocalOnly(false)).toThrow(/Wait/);
    await expect(onlineOperation(async () => 'update')).rejects.toThrow(/disabled/);
    await expect(desktopTask(false, async () => undefined)).rejects.toThrow(/Another/);
  });
});
it('refuses a private run while an explicit online operation is still active', async () => {
  setLocalOnly(false);
  await onlineOperation(async () => {
    await expect(desktopTask(true, async () => undefined)).rejects.toThrow(/Another/);
  });
  await desktopTask(true, async () => expect(isLocalOnly()).toBe(true));
});
