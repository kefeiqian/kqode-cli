import { describe, expect, it } from 'vitest';
import {
  CREDENTIAL_SOURCE_KEYCHAIN,
  PROVIDER_STATUS_CONNECTED,
  PROVIDER_STATUS_NOT_CONFIGURED,
  SET_KEY_OUTCOME_AUTH_FAILED,
  SET_KEY_OUTCOME_CONNECTED,
  SET_KEY_OUTCOME_EMPTY_CATALOG,
  SET_KEY_OUTCOME_NOT_COMPATIBLE,
  SET_KEY_OUTCOME_RATE_LIMITED,
  SET_KEY_OUTCOME_STORE_FAILED,
  SET_KEY_OUTCOME_UNREACHABLE
} from '@contracts/backend/index.ts';
import { activeSurfaceAtom, Surface } from '@state/ui/index.ts';
import {
  ConnectStep,
  PROVIDER_ID_CUSTOM,
  PROVIDER_ID_KIMI,
  customBaseUrlAtom,
  customLabelAtom,
  connectReturnToModelAtom,
  connectLastOutcomeAtom,
  connectSelectedIndexAtom,
  connectStepAtom,
  connectTargetProviderIdAtom
} from '@state/ui/connect/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { fakeClient, provider, renderConnect, waitForFrame, waitUntil } from '@components/ConnectSurface/__tests__/testUtils.tsx';

describe('ConnectSurface', () => {
  it('connects Kimi with a masked key and lands in the model picker', async () => {
    const client = fakeClient({ outcome: SET_KEY_OUTCOME_CONNECTED });
    const { store, stdin, lastFrame } = renderConnect(client);
    await waitForFrame(lastFrame, 'Kimi');

    stdin.write('\n');
    await flushInput();
    stdin.write('sk-valid-kimi');
    await flushInput();
    stdin.write('\r');
    await waitUntil(() => store.get(activeSurfaceAtom) === Surface.Model, 'model picker open');

    expect(client.setProviderKey).toHaveBeenCalledWith(expect.objectContaining({ providerId: PROVIDER_ID_KIMI, apiKey: 'sk-valid-kimi' }));
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Model);
  });

  it('renders auth failure and stays open for a 401-style Kimi result', async () => {
    const client = fakeClient({ outcome: SET_KEY_OUTCOME_AUTH_FAILED });
    const { store, stdin, lastFrame } = renderConnect(client);
    await waitForFrame(lastFrame, 'Kimi');

    stdin.write('\r');
    await flushInput();
    stdin.write('sk-bad');
    await flushInput();
    stdin.write('\r');
    const frame = await waitForFrame(lastFrame, 'Authentication failed');

    expect(frame).toContain('fix the key or URL');
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Connect);
  });

  it.each([
    [SET_KEY_OUTCOME_RATE_LIMITED, 'Rate limited', 'wait & retry'],
    [SET_KEY_OUTCOME_UNREACHABLE, 'Provider unreachable', 'wait & retry'],
    [SET_KEY_OUTCOME_EMPTY_CATALOG, 'Model catalog is empty', 'fix the key or URL']
  ] as const)('keeps the surface open for %s', async (outcome, headline, hint) => {
    const { store, stdin, lastFrame } = renderConnect(fakeClient({ outcome }));
    await waitForFrame(lastFrame, 'Kimi');

    stdin.write('\r');
    await flushInput();
    stdin.write('sk-retry');
    await flushInput();
    stdin.write('\r');
    const frame = await waitForFrame(lastFrame, headline);

    expect(frame).toContain(hint);
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Connect);
  });

  it('renders Custom not-compatible as a terminal URL/key error', async () => {
    const client = fakeClient({ outcome: SET_KEY_OUTCOME_NOT_COMPATIBLE });
    const { store, stdin, lastFrame } = renderConnect(client);
    await waitForFrame(lastFrame, 'Custom');

    store.set(connectSelectedIndexAtom, 1);
    store.set(customBaseUrlAtom, 'https://ok.test/v1');
    store.set(customLabelAtom, '');
    store.set(connectStepAtom, ConnectStep.Key);
    await waitForFrame(lastFrame, 'API key');
    await flushInput();
    stdin.write('sk-custom');
    await waitForFrame(lastFrame, '••••');
    stdin.write('\r');
    const frame = await waitForFrame(lastFrame, 'Endpoint not compatible');

    expect(frame).toContain('/v1/models');
    expect(client.setProviderKey).toHaveBeenCalledWith(expect.objectContaining({ providerId: PROVIDER_ID_CUSTOM, baseUrl: 'https://ok.test/v1' }));
  });

  it('clears a key and re-renders refreshed not-configured status', async () => {
    const client = fakeClient({
      providers: [
        [provider(PROVIDER_ID_KIMI, 'Kimi', PROVIDER_STATUS_CONNECTED, CREDENTIAL_SOURCE_KEYCHAIN)],
        [provider(PROVIDER_ID_KIMI, 'Kimi', PROVIDER_STATUS_NOT_CONFIGURED)]
      ]
    });
    const { stdin, lastFrame } = renderConnect(client);
    await waitForFrame(lastFrame, 'connected via keychain');

    stdin.write('\n');
    await flushInput();
    stdin.write('c');
    await flushInput();
    stdin.write('y');
    const frame = await waitForFrame(lastFrame, 'not configured');

    expect(client.clearProviderKey).toHaveBeenCalledWith(PROVIDER_ID_KIMI);
    expect(frame).toContain('not configured');
  });

  it('preselects Custom for a model deep-link and returns to model on Esc', async () => {
    const { store, stdin, lastFrame } = renderConnect(fakeClient(), (nextStore) => {
      nextStore.set(connectTargetProviderIdAtom, PROVIDER_ID_CUSTOM);
      nextStore.set(connectReturnToModelAtom, true);
    });

    const frame = await waitForFrame(lastFrame, 'Base URL');
    expect(frame).toContain('Custom');
    expect(store.get(connectStepAtom)).toBe(ConnectStep.CustomUrl);

    stdin.write('\u001B');
    await flushInput();
    await waitUntil(() => store.get(activeSurfaceAtom) === Surface.Model, 'model return');
  });

  it("renders a Custom-specific store failure instead of a keychain hint", async () => {
    const { store, lastFrame } = renderConnect();
    await waitForFrame(lastFrame, 'Custom');

    store.set(connectSelectedIndexAtom, 1);
    store.set(connectLastOutcomeAtom, {
      outcome: SET_KEY_OUTCOME_STORE_FAILED,
      providerId: PROVIDER_ID_CUSTOM,
      selectedModel: null
    });
    const frame = await waitForFrame(lastFrame, "Custom can't be saved while settings storage is unavailable");

    expect(frame).not.toContain('Keychain write failed');
  });


  it('advances and backs through Custom fields without advancing invalid URLs', async () => {
    const first = renderConnect();
    await waitForFrame(first.lastFrame, 'Custom');

    first.stdin.write('\u001B[B');
    await flushInput();
    first.stdin.write('\n');
    await flushInput();
    first.stdin.write('http://bad.test');
    await waitForFrame(first.lastFrame, 'http://bad.test');
    first.stdin.write('\r');
    let frame = await waitForFrame(first.lastFrame, 'base URL must use the https scheme');
    expect(frame).toContain('› Base URL');

    const { stdin, lastFrame } = renderConnect();
    await waitForFrame(lastFrame, 'Custom');
    stdin.write('\u001B[B');
    await flushInput();
    stdin.write('\n');
    await flushInput();
    stdin.write('https://ok.test/v1');
    await waitForFrame(lastFrame, 'https://ok.test/v1');
    stdin.write('\n');
    await flushInput();
    stdin.write('\n');
    frame = await waitForFrame(lastFrame, 'API key');
    expect(frame).toContain('Label: optional');

    stdin.write('\u001B[A');
    await flushInput();
    frame = await waitForFrame(lastFrame, '› Label');
    expect(frame).toContain('Destination host: ok.test');

    stdin.write('\u001B[Z');
    await flushInput();
    frame = await waitForFrame(lastFrame, '› Base URL');
    expect(frame).toContain('https://ok.test/v1');
  });

  it('keeps typed key material out of Jotai atom snapshots before submit', async () => {
    const secret = 'sk-local-only-Connect-secret';
    const { store, stdin, lastFrame } = renderConnect();
    await waitForFrame(lastFrame, 'Kimi');

    stdin.write('\r');
    await flushInput();
    stdin.write(secret);
    await flushInput();

    const devStore = store as typeof store & { dev_get_mounted_atoms?: () => Iterable<unknown>; get: (atom: never) => unknown };
    const values = Array.from(devStore.dev_get_mounted_atoms?.() ?? []).map((atom) => devStore.get(atom as never));
    expect(JSON.stringify(values)).not.toContain(secret);
    expect(lastFrame() ?? '').not.toContain(secret);
  });
});
