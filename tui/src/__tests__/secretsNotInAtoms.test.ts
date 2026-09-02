import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Atom } from 'jotai';
import { SET_KEY_OUTCOME_AUTH_FAILED } from '@contracts/backend/index.ts';
import * as connectAtoms from '@state/ui/connect/index.ts';
import * as modelAtoms from '@state/ui/model/index.ts';
import { flushInput } from '@test/flushInput.ts';
import { fakeClient, provider, renderModel, waitForFrame } from '@components/ModelSurface/__tests__/testUtils.tsx';

const STATE_UI_ROOT = join(process.cwd(), 'src', 'state', 'ui');
const FORBIDDEN = [
  /\bapiKey\b/,
  /setProviderKey/,
  /MaskedInput/
];

const SENTINEL_KEY = 'sk-SENTINEL-6d3ff57f-must-not-be-stored';

type ReadableStore = { get: (atom: Atom<unknown>) => unknown };

describe('secret-bearing provider keys stay out of ui atoms', () => {
  it('keeps state/ui modules free of key setters, masked inputs, and apiKey fields', () => {
    const offenders = walk(STATE_UI_ROOT)
      .filter((file) => !file.includes(`${join('__tests__')}`))
      .filter((file) => FORBIDDEN.some((pattern) => pattern.test(readFileSync(file, 'utf8'))));

    expect(offenders).toEqual([]);
  });

  it('never lands the entered inline key in any model or connect ui atom', async () => {
    // Runtime complement to the static scan: drive a real inline connect with a
    // sentinel key. The auth-failed path leaves the inline state populated for
    // retry, so any atom that stored the key (even an arbitrarily-named one like
    // pendingKeyAtom) would still hold it here.
    const client = fakeClient({ providers: [provider('kimi', 'Kimi', false)] });
    vi.mocked(client.setProviderKey).mockResolvedValue({ outcome: SET_KEY_OUTCOME_AUTH_FAILED, selectedModel: null });
    const { store, stdin, lastFrame } = renderModel(client);
    await waitForFrame(lastFrame, 'not connected');

    stdin.write('\r');
    await waitForFrame(lastFrame, 'API key');
    stdin.write(SENTINEL_KEY);
    await flushInput();
    stdin.write('\r');
    await waitForFrame(lastFrame, 'Authentication failed');

    expect(client.setProviderKey).toHaveBeenCalledWith(expect.objectContaining({ apiKey: SENTINEL_KEY }));
    expect(leakingAtoms(store, modelAtoms)).toEqual([]);
    expect(leakingAtoms(store, connectAtoms)).toEqual([]);
  });
});

function leakingAtoms(store: ReadableStore, module: Record<string, unknown>): string[] {
  return Object.entries(module)
    .filter(([, value]) => isReadableAtom(value))
    .filter(([, value]) => serialize(safeGet(store, value as Atom<unknown>)).includes(SENTINEL_KEY))
    .map(([name]) => name);
}

function isReadableAtom(value: unknown): value is Atom<unknown> {
  return typeof value === 'object' && value !== null && 'read' in value;
}

function safeGet(store: ReadableStore, atom: Atom<unknown>): unknown {
  try {
    return store.get(atom);
  } catch {
    return undefined;
  }
}

function serialize(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return String(value);
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return walk(path);
    }
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}
