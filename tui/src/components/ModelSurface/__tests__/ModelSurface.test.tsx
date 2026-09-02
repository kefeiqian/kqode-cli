import { describe, expect, it, vi } from 'vitest';
import {
  MODEL_LIST_STATUS_EMPTY,
  MODEL_LIST_STATUS_FAILED,
  MODEL_LIST_STATUS_LOADED,
  SET_KEY_OUTCOME_AUTH_FAILED,
  SET_KEY_OUTCOME_CONNECTED
} from '@contracts/backend/index.ts';
import { activeSurfaceAtom, Surface } from '@state/ui/index.ts';
import { inlineConnectProviderIdAtom, modelHighlightAtom, modelActiveSelectionAtom } from '@state/ui/model/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { deferredList, fakeClient, provider, renderModel, waitForFrame, waitUntil } from './testUtils.tsx';

describe('ModelSurface', () => {
  it('renders grouped models and opens scrolled to the active model', async () => {
    const client = fakeClient({
      providers: [provider('kimi', 'Kimi'), provider('custom', 'Custom')],
      active: { providerId: 'custom', modelId: 'c3' },
      lists: {
        kimi: {
          status: MODEL_LIST_STATUS_LOADED,
          models: [
            { id: 'k1', ownedBy: null },
            { id: 'k2', ownedBy: null },
            { id: 'k3', ownedBy: null },
            { id: 'k4', ownedBy: null },
            { id: 'k5', ownedBy: null },
            { id: 'k6', ownedBy: null },
            { id: 'k7', ownedBy: null },
            { id: 'k8', ownedBy: null },
            { id: 'k9', ownedBy: null },
            { id: 'k10', ownedBy: null },
            { id: 'k11', ownedBy: null },
            { id: 'k12', ownedBy: null }
          ]
        },
        custom: {
          status: MODEL_LIST_STATUS_LOADED,
          models: [{ id: 'c1', ownedBy: null }, { id: 'c2', ownedBy: null }, { id: 'c3', ownedBy: null }]
        }
      }
    });
    const { lastFrame } = renderModel(client, 20);

    const frame = await waitForFrame(lastFrame, '● c3');

    expect(frame).toContain('Custom');
    expect(frame).not.toMatch(/^\s+k1$/m);
  });

  it('shows an explicit empty row for empty providers', async () => {
    const { lastFrame } = renderModel(fakeClient({
      providers: [provider('kimi', 'Kimi')],
      lists: { kimi: { status: MODEL_LIST_STATUS_EMPTY, models: [] } }
    }));

    expect(await waitForFrame(lastFrame, '(no models)')).toContain('Kimi');
  });

  it('shows connected models and disconnected providers as separate sections', async () => {
    const client = fakeClient({
      providers: [
        provider('kimi', 'Kimi'),
        provider('custom', 'Custom', false)
      ],
      lists: { kimi: { status: MODEL_LIST_STATUS_LOADED, models: [{ id: 'k1', ownedBy: null }] } }
    });
    const { lastFrame } = renderModel(client, 20);

    const frame = await waitForFrame(lastFrame, '(not connected — enter to connect)');
    expect(frame).toContain('Kimi (via keychain)');
    expect(frame).toContain('k1');
    expect(frame).toContain('Custom');
    expect(client.listModels).toHaveBeenCalledTimes(1);
    expect(client.listModels).toHaveBeenCalledWith('kimi');
  });

  it('retries a reachable failed provider without downgrading it', async () => {
    const client = fakeClient({
      providers: [provider('kimi', 'Kimi')],
      lists: { kimi: { status: MODEL_LIST_STATUS_FAILED, models: [] } }
    });
    const { stdin, lastFrame } = renderModel(client);
    await waitForFrame(lastFrame, '❯   failed to load ↻');

    await flushInput();
    stdin.write('\n');
    await flushInput();

    await waitUntil(() => vi.mocked(client.listModels).mock.calls.length === 2, 'retry call');
    expect(await waitForFrame(lastFrame, 'failed to load ↻')).toContain('Kimi');
  });

  it('keeps the highlighted identity when a provider above resolves late', async () => {
    const delayed = deferredList();
    const client = fakeClient({
      providers: [provider('a', 'A'), provider('b', 'B')],
      active: { providerId: 'b', modelId: 'b2' },
      lists: {
        a: delayed.promise,
        b: { status: MODEL_LIST_STATUS_LOADED, models: [{ id: 'b1', ownedBy: null }, { id: 'b2', ownedBy: null }] }
      }
    });
    const { store, lastFrame } = renderModel(client, 20);
    await waitForFrame(lastFrame, '● b2');
    const before = store.get(modelHighlightAtom);

    delayed.resolve({ status: MODEL_LIST_STATUS_LOADED, models: [{ id: 'a1', ownedBy: null }, { id: 'a2', ownedBy: null }] });
    await waitForFrame(lastFrame, 'a2');

    expect(store.get(modelHighlightAtom)).toEqual(before);
    expect(lastFrame() ?? '').toContain('❯ ● b2');
  });

  it('renders control and ANSI model ids inert after sanitization', async () => {
    const { lastFrame } = renderModel(fakeClient({
      providers: [provider('custom', 'Custom')],
      lists: { custom: { status: MODEL_LIST_STATUS_LOADED, models: [{ id: 'gpt\u001B[31m\nbad', ownedBy: null }] } }
    }));

    const frame = await waitForFrame(lastFrame, 'gptbad');
    expect(frame).not.toContain('\u001B[31m');
  });

  it('selects a model, updates active selection, and closes', async () => {
    const client = fakeClient({
      providers: [provider('kimi', 'Kimi')],
      lists: { kimi: { status: MODEL_LIST_STATUS_LOADED, models: [{ id: 'k1', ownedBy: null }] } }
    });
    const { store, stdin, lastFrame } = renderModel(client);
    await waitForFrame(lastFrame, 'k1');

    stdin.write('\r');
    await flushInput();

    expect(client.setActiveSelection).toHaveBeenCalledWith('kimi', 'k1');
    expect(store.get(modelActiveSelectionAtom)).toEqual({ providerId: 'kimi', modelId: 'k1' });
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Home);
  });

  it('renders a navigable provider list when opened without a connected provider', async () => {
    const client = fakeClient({ providers: [provider('kimi', 'Kimi', false)] });
    const { store, lastFrame } = renderModel(client);

    const frame = await waitForFrame(lastFrame, '❯   (not connected — enter to connect)');
    expect(frame).toContain('Kimi');
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Model);
  });

  it('connects a preset provider inline and loads its models in place', async () => {
    const disconnected = provider('kimi', 'Kimi', false);
    const connected = {
      ...provider('kimi', 'Kimi', true),
      defaultModel: 'k1'
    };
    const client = fakeClient({
      providers: [disconnected],
      lists: { kimi: { status: MODEL_LIST_STATUS_LOADED, models: [{ id: 'k1', ownedBy: null }] } }
    });
    vi.mocked(client.listProviders)
      .mockResolvedValueOnce({ providers: [disconnected] })
      .mockResolvedValueOnce({ providers: [connected] });
    vi.mocked(client.setProviderKey).mockResolvedValue({ outcome: SET_KEY_OUTCOME_CONNECTED, selectedModel: 'k1' });
    const { stdin, lastFrame } = renderModel(client);
    await waitForFrame(lastFrame, '❯   (not connected — enter to connect)');

    stdin.write('\r');
    await waitForFrame(lastFrame, 'API key');
    stdin.write('sk-inline-good');
    await flushInput();
    stdin.write('\r');

    const frame = await waitForFrame(lastFrame, '❯ ● k1');
    expect(frame).toContain('Kimi (via keychain)');
    expect(client.setProviderKey).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'kimi', apiKey: 'sk-inline-good' }));
    expect(client.listModels).toHaveBeenCalledWith('kimi');
  });

  it('keeps inline preset failures in the model flow for retry', async () => {
    const client = fakeClient({ providers: [provider('kimi', 'Kimi', false)] });
    vi.mocked(client.setProviderKey).mockResolvedValue({ outcome: SET_KEY_OUTCOME_AUTH_FAILED, selectedModel: null });
    const { store, stdin, lastFrame } = renderModel(client);
    await waitForFrame(lastFrame, 'not connected');

    stdin.write('\r');
    await waitForFrame(lastFrame, 'API key');
    stdin.write('sk-inline-bad');
    await flushInput();
    stdin.write('\r');
    const frame = await waitForFrame(lastFrame, 'Authentication failed');

    expect(frame).toContain('API key');
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Model);
    expect(client.listModels).not.toHaveBeenCalled();
  });

  it('lets Esc cancel inline entry without closing the model front door', async () => {
    const client = fakeClient({ providers: [provider('kimi', 'Kimi', false)] });
    const { store, stdin, lastFrame } = renderModel(client);
    await waitForFrame(lastFrame, 'not connected');

    stdin.write('\r');
    await waitForFrame(lastFrame, 'API key');
    stdin.write('\u001B');
    await flushInput();
    await waitUntil(() => store.get(inlineConnectProviderIdAtom) === null, 'inline cancel');

    expect(lastFrame() ?? '').not.toContain('API key');
    expect(store.get(activeSurfaceAtom)).toBe(Surface.Model);
    expect(client.setProviderKey).not.toHaveBeenCalled();
  });

  it('opens Connect for a not-connected Custom provider', async () => {
    const client = fakeClient({ providers: [provider('custom', 'Custom', false)] });
    const { store, stdin, lastFrame } = renderModel(client);
    await waitForFrame(lastFrame, '❯   (not connected — enter to connect)');

    stdin.write('\r');
    await flushInput();

    expect(store.get(activeSurfaceAtom)).toBe(Surface.Connect);
  });
});
