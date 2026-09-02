import { useInput } from 'ink';
import { useAtomValue, useSetAtom } from 'jotai';
import { useRef } from 'react';
import type { MemoryItem } from '@contracts/backend/index.ts';
import { MODIFIED_ENTER_INPUTS } from '@components/PromptComposer/constants.ts';
import { printableInput } from '@libs/composer/promptText.ts';
import { isMouseInput } from '@libs/terminal/mouse.ts';
import {
  MemoryFormField,
  type MemoryFormState,
  closeMemoryFormAtom,
  memoryFormAtom,
  setMemoryFormBodyAtom,
  setMemoryFormErrorAtom,
  setMemoryFormFieldAtom,
  setMemoryFormTitleAtom
} from '@state/ui/memory/index.ts';

const SHIFT_TAB_INPUT = '\u001B[Z';

export type MemoryFormActions = {
  addItem: (params: { title: string; body: string }) => Promise<void>;
  editItem: (params: { item: MemoryItem; title: string; body: string }) => Promise<void>;
};

export function useMemoryFormInput(actions: MemoryFormActions) {
  const form = useLatest(useAtomValue(memoryFormAtom));
  const closeForm = useSetAtom(closeMemoryFormAtom);
  const setField = useSetAtom(setMemoryFormFieldAtom);
  const setTitle = useSetAtom(setMemoryFormTitleAtom);
  const setBody = useSetAtom(setMemoryFormBodyAtom);
  const setError = useSetAtom(setMemoryFormErrorAtom);

  useInput(
    (input, key) => {
      const current = form.current;
      if (current === null || isMouseInput(input)) {
        return;
      }
      if (key.escape) {
        closeForm();
        return;
      }
      if (key.tab || isShiftTab(input, key)) {
        setField(current.activeField === MemoryFormField.Title ? MemoryFormField.Body : MemoryFormField.Title);
        return;
      }
      if (key.return && current.activeField === MemoryFormField.Body) {
        const newline = classifyBodyNewline(input, key, current.body, current.bodyCursor);
        if (newline !== null) {
          const body = newline === 'replace-backslash'
            ? replaceRange(current.body, current.bodyCursor - 1, current.bodyCursor, '\n')
            : replaceRange(current.body, current.bodyCursor, current.bodyCursor, '\n');
          const cursor = current.bodyCursor + (newline === 'replace-backslash' ? 0 : 1);
          setBody({ body, cursor });
          return;
        }

        function classifyBodyNewline(
          input: string,
          key: Parameters<Parameters<typeof useInput>[0]>[1],
          body: string,
          cursor: number
        ): 'insert-newline' | 'replace-backslash' | null {
          if (MODIFIED_ENTER_INPUTS.has(input) || key.shift === true || key.ctrl === true || key.meta === true) {
            return 'insert-newline';
          }
          return cursor > 0 && body.at(cursor - 1) === '\\' ? 'replace-backslash' : null;
        }
      }
      if (key.return) {
        void submit(current, actions, setError);
        return;
      }
      editCurrentField(input, key, current, { setTitle, setBody });
    }
  );
}

async function submit(
  form: MemoryFormState,
  actions: MemoryFormActions,
  setError: (error: { titleError?: string | null; submitError?: string | null }) => void
) {
  const title = form.title.trim();
  if (title.length === 0) {
    setError({ titleError: 'Title is required' });
    return;
  }
  if (form.mode === 'edit' && form.item !== null) {
    await actions.editItem({ item: form.item, title, body: form.body });
  } else {
    await actions.addItem({ title, body: form.body });
  }
}

function editCurrentField(
  input: string,
  key: Parameters<Parameters<typeof useInput>[0]>[1],
  form: MemoryFormState,
  setters: {
    setTitle: (update: { title: string; cursor: number }) => void;
    setBody: (update: { body: string; cursor: number }) => void;
  }
) {
  if (form.activeField === MemoryFormField.Title) {
    const edited = editText(input, key, form.title, form.titleCursor, false);
    if (edited !== null) {
      setters.setTitle({ title: edited.text, cursor: edited.cursor });
    }
  } else {
    const edited = editText(input, key, form.body, form.bodyCursor, true);
    if (edited !== null) {
      setters.setBody({ body: edited.text, cursor: edited.cursor });
    }
  }
}

function editText(
  input: string,
  key: Parameters<Parameters<typeof useInput>[0]>[1],
  value: string,
  cursor: number,
  multiline: boolean
): { text: string; cursor: number } | null {
  if (key.leftArrow) return { text: value, cursor: Math.max(0, cursor - 1) };
  if (key.rightArrow) return { text: value, cursor: Math.min(value.length, cursor + 1) };
  if (multiline && key.upArrow) return { text: value, cursor: 0 };
  if (multiline && key.downArrow) return { text: value, cursor: value.length };
  if (key.backspace || key.delete) {
    if (cursor === 0) return { text: value, cursor };
    return { text: replaceRange(value, cursor - 1, cursor, ''), cursor: cursor - 1 };
  }
  if (key.ctrl === true || key.meta === true) return null;
  const printable = printableInput(input);
  if (printable.length === 0 || (!multiline && printable.includes('\n'))) return null;
  return { text: replaceRange(value, cursor, cursor, printable), cursor: cursor + printable.length };
}

function replaceRange(value: string, start: number, end: number, replacement: string): string {
  return `${value.slice(0, start)}${replacement}${value.slice(end)}`;
}

function isShiftTab(input: string, key: Parameters<Parameters<typeof useInput>[0]>[1]) {
  const extendedKey = key as typeof key & { shift?: boolean; shiftTab?: boolean };
  return input === SHIFT_TAB_INPUT || extendedKey.shiftTab === true || (key.tab && extendedKey.shift === true);
}

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
