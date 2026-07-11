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
import { activeSurfaceAtom, rowsTestOverrideAtom, Surface } from '@state/ui/index.ts';
import {
  ConnectStep,
  PROVIDER_ID_CUSTOM,
  PROVIDER_ID_KIMI,
  customBaseUrlAtom,
  customLabelAtom,
  connectReturnToModelAtom,
  connectLastOutcomeAtom,
  connectRequestErrorAtom,
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
    expect(frame).toContain('❯ Base URL');

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
    expect(frame).toContain('Destination host: ok.test');

    stdin.write('\u001B[A');
    await flushInput();
    frame = await waitForFrame(lastFrame, '❯ Label');
    expect(frame).toContain('Destination host: ok.test');

    stdin.write('\u001B[Z');
    await flushInput();
    frame = await waitForFrame(lastFrame, '❯ Base URL');
    expect(frame).toContain('https://ok.test/v1');
  });

  it('replaces the raw URL parser error with a friendly empty-field message', async () => {
    const { stdin, lastFrame } = renderConnect();
    await waitForFrame(lastFrame, 'Custom');

    stdin.write('\u001B[B');
    await flushInput();
    stdin.write('\n');
    await flushInput();
    stdin.write('\r'); // submit an empty Base URL
    const frame = await waitForFrame(lastFrame, 'base URL is required');

    expect(frame).not.toContain('TypeError');
  });

  it('distinguishes the empty Base URL placeholder from typed input with a leading caret', async () => {
    const { stdin, lastFrame } = renderConnect();
    await waitForFrame(lastFrame, 'Custom');

    stdin.write('\u001B[B');
    await flushInput();
    stdin.write('\n');
    const frame = await waitForFrame(lastFrame, '▌ https://api.example.com/v1');

    expect(frame).toContain('▌ https://api.example.com/v1');
  });

  it('edits the Base URL at the caret with arrow keys', async () => {
    const { stdin, lastFrame } = renderConnect();
    await waitForFrame(lastFrame, 'Custom');

    stdin.write('\u001B[B');
    await flushInput();
    stdin.write('\n');
    await flushInput();
    stdin.write('hello');
    await waitForFrame(lastFrame, 'hello▌');
    stdin.write('\u001B[D');
    await flushInput();
    stdin.write('\u001B[D');
    await flushInput();
    stdin.write('X');
    const frame = await waitForFrame(lastFrame, 'helX▌lo');

    expect(frame).toContain('helX▌lo');
  });

  it('advances Base URL → Label on Down for consistent field navigation', async () => {
    const { store, stdin, lastFrame } = renderConnect();
    await waitForFrame(lastFrame, 'Custom');

    stdin.write('\u001B[B');
    await flushInput();
    stdin.write('\n');
    await flushInput();
    stdin.write('https://ok.test/v1');
    await waitForFrame(lastFrame, 'https://ok.test/v1');
    stdin.write('\u001B[B'); // Down advances to the Label field
    await waitForFrame(lastFrame, '❯ Label');

    expect(store.get(connectStepAtom)).toBe(ConnectStep.CustomLabel);
  });

  it('shows an API-key hint and hides the field-nav footer on the key step', async () => {
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
    const frame = await waitForFrame(lastFrame, 'API key');

    expect(frame).toContain('Enter submits');
    expect(frame).not.toContain('Enter/↓ next');
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

  it('clips the docked panel top-down without squishing chrome at small terminals (P007 U6 review)', async () => {
    const { store, lastFrame } = renderConnect(fakeClient(), (nextStore) => {
      nextStore.set(rowsTestOverrideAtom, 15); // half-height cap = 7 rows
    });
    await waitForFrame(lastFrame, 'Kimi');

    // Force the tall custom Key step so the content exceeds the 7-row cap.
    store.set(connectSelectedIndexAtom, 1);
    store.set(customBaseUrlAtom, 'https://ok.test/v1');
    store.set(connectStepAtom, ConnectStep.Key);
    await waitForFrame(lastFrame, 'Destination host');

    const lines = (lastFrame() ?? '').split('\n');
    const titleLine = lines.find((line) => line.includes('/connect'));
    expect(lines.some((line) => /^─+\s*$/.test(line))).toBe(true); // divider is its own clean row
    expect(titleLine).toBeDefined();
    expect(titleLine).not.toMatch(/─/); // title not squished into the divider
  });

  it('renders the list-step request-error hint without dropping chrome or provider rows (P007 U6 review)', async () => {
    const { store, lastFrame } = renderConnect();
    await waitForFrame(lastFrame, 'Custom');

    // Reachable when listProviders() fails on open: a hint is set while step stays List.
    store.set(connectRequestErrorAtom, 'Could not read providers — ensure settings storage is available, then retry.');
    const frame = await waitForFrame(lastFrame, 'Could not read providers');

    const lines = frame.split('\n');
    const titleLine = lines.find((line) => line.includes('/connect'));
    expect(lines.some((line) => /^─+\s*$/.test(line))).toBe(true); // divider survives
    expect(titleLine).not.toMatch(/─/); // title row intact, not merged into the divider
    expect(frame).toContain('Kimi'); // neither provider row is clipped away
    expect(frame).toContain('Custom');
  });

  it('identifies the active provider in the label and pins a footer with a gap on the key step', async () => {
    const { stdin, lastFrame } = renderConnect(fakeClient());
    await waitForFrame(lastFrame, 'Kimi');

    stdin.write('\n'); // select Kimi → Key step
    const frame = await waitForFrame(lastFrame, 'API key');

    const lines = frame.split('\n');
    const titleIdx = lines.findIndex((line) => line.includes('/connect · Kimi'));
    const footerIdx = lines.findIndex((line) => line.includes('Enter submits'));
    expect(titleIdx).toBeGreaterThanOrEqual(0); // provider stays identified while the list is hidden
    expect(footerIdx).toBeGreaterThan(titleIdx); // footer pinned below the body
    expect(lines[footerIdx - 1].trim()).toBe(''); // one blank gap row directly above the footer
  });

  it('keeps the active custom key input visible at the minimum terminal height', async () => {
    const { store, lastFrame } = renderConnect(fakeClient(), (nextStore) => {
      nextStore.set(rowsTestOverrideAtom, 15); // half-height cap = 7 rows, body ≈ 3
    });
    await waitForFrame(lastFrame, 'Kimi');

    store.set(connectSelectedIndexAtom, 1); // Custom
    store.set(customBaseUrlAtom, 'https://ok.test/v1');
    store.set(connectStepAtom, ConnectStep.Key);
    const frame = await waitForFrame(lastFrame, 'API key');

    expect(frame).toContain('API key'); // active input not clipped at min height
    expect(frame).toContain('/connect · Custom'); // provider still identified
  });
});
