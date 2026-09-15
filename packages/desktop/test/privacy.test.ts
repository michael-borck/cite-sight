import { afterEach, expect, it } from 'vitest';
import { allowRendererRequest, desktopTask, isLocalOnly, onlineOperation, setLocalOnly, setupOperation } from '../src/main/privacy';

afterEach(() => setLocalOnly(true));
it('allows model setup while a batch is merely open, but never during analysis', async () => {
  setLocalOnly(true);
  await setupOperation(async () => {
    expect(isLocalOnly()).toBe(true);
    await expect(desktopTask(true, async () => {})).rejects.toThrow(/Another/);
  });
  // An active analysis excludes setup; a merely-open batch does not.
  await desktopTask(true, async () => {
    await expect(setupOperation(async () => 'setup')).rejects.toThrow(/Wait for the current operation/);
  });
  await setupOperation(async () => 'setup while batch open');
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
