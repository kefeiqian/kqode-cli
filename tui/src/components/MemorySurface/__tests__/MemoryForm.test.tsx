import { describe, expect, it } from 'vitest';
import { MemoryForm } from '@components/MemorySurface/MemoryForm.tsx';
import {
  MemoryFormField,
  MemoryFormMode,
  type MemoryFormState
} from '@state/ui/memory/index.ts';
import { renderWithJotai } from '@test/renderWithJotai.tsx';

const form = (overrides: Partial<MemoryFormState> = {}): MemoryFormState => ({
  mode: MemoryFormMode.Add,
  item: null,
  title: '',
  body: '',
  activeField: MemoryFormField.Title,
  titleCursor: 0,
  bodyCursor: 0,
  titleError: null,
  submitError: null,
  ...overrides
});

describe('MemoryForm', () => {
  it('renders title and body rows inside the safe width', () => {
    const { lastFrame } = renderWithJotai(
      <MemoryForm columns={30} form={form({ title: 'Project rule', body: 'Line one\nLine two' })} />
    );
    const frame = lastFrame() ?? '';

    expect(frame).toContain('Add project memory');
    expect(frame).toContain('Title:');
    expect(frame).toContain('Body:');
    for (const line of frame.split('\n')) {
      expect(line.length).toBeLessThanOrEqual(30);
    }
  });

  it('shows inline validation and submit errors', () => {
    const { lastFrame } = renderWithJotai(
      <MemoryForm columns={80} form={form({ titleError: 'Title is required', submitError: 'backend down' })} />
    );

    expect(lastFrame() ?? '').toContain('Title is required');
    expect(lastFrame() ?? '').toContain('backend down');
  });
});
