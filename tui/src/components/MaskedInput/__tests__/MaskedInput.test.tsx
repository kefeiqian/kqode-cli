import { createStore } from 'jotai';
import { describe, expect, it, vi } from 'vitest';
import { MaskedInput } from '@components/MaskedInput/index.tsx';
import { flushInput } from '@test/flushInput.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

function renderMaskedInput(onSubmit = vi.fn()) {
  const store = createStore();
  const onCancel = vi.fn();
  return {
    store,
    onCancel,
    onSubmit,
    ...renderWithJotai(<MaskedInput onCancel={onCancel} onSubmit={onSubmit} />, store)
  };
}

describe('MaskedInput', () => {
  it('never renders plaintext key material', async () => {
    const secret = 'sk-secret-plain-never';
    const { lastFrame, stdin } = renderMaskedInput();

    stdin.write(secret);
    await flushInput();

    const frame = lastFrame() ?? '';
    expect(frame).not.toContain(secret);
    expect(frame).toContain('•');
  });

  it('deletes one Unicode code point on backspace', async () => {
    const onSubmit = vi.fn();
    const { stdin } = renderMaskedInput(onSubmit);

    stdin.write('a😀');
    await flushInput();
    stdin.write('\b');
    await flushInput();
    stdin.write('\r');
    await flushInput();

    expect(onSubmit).toHaveBeenCalledWith('a');
  });

  it('inserts bracketed paste without echoing the pasted secret', async () => {
    const secret = 'pasted-secret-value';
    const onSubmit = vi.fn();
    const { lastFrame, stdin } = renderMaskedInput(onSubmit);

    stdin.write(`\u001B[200~${secret}\u001B[201~`);
    await flushInput();

    expect(lastFrame() ?? '').not.toContain(secret);
    stdin.write('\r');
    await flushInput();

    expect(onSubmit).toHaveBeenCalledWith(secret);
  });

  it('trims leading and trailing whitespace on submit', async () => {
    const onSubmit = vi.fn();
    const { stdin } = renderMaskedInput(onSubmit);

    stdin.write('  trim-me  ');
    await flushInput();
    stdin.write('\r');
    await flushInput();

    expect(onSubmit).toHaveBeenCalledWith('trim-me');
  });

  it('keeps entered key material out of Jotai atom snapshots', async () => {
    const secret = 'local-only-secret';
    const { store, stdin } = renderMaskedInput();

    stdin.write(secret);
    await flushInput();

    const devStore = store as typeof store & {
      dev_get_mounted_atoms?: () => Iterable<unknown>;
      get: (atom: never) => unknown;
    };
    const values = Array.from(devStore.dev_get_mounted_atoms?.() ?? []).map((atom) =>
      devStore.get(atom as never)
    );

    expect(JSON.stringify(values)).not.toContain(secret);
  });
});
