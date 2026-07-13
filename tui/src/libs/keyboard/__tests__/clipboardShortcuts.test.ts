import { describe, expect, it } from 'vitest';
import {
  isClipboardPasteShortcut,
  isCtrlCShortcut,
  isModifierOnlyKeyEvent,
  isSelectionCopyShortcut
} from '@libs/keyboard/clipboardShortcuts.ts';

describe('isCtrlCShortcut', () => {
  it('accepts only Ctrl+C', () => {
    expect(isCtrlCShortcut('c', { ctrl: true })).toBe(true);
    expect(isCtrlCShortcut('c', { super: true })).toBe(false);
    expect(isCtrlCShortcut('o', { ctrl: true })).toBe(false);
  });
});

describe('isSelectionCopyShortcut', () => {
  it('accepts Ctrl+C on every platform', () => {
    expect(isSelectionCopyShortcut('c', { ctrl: true }, 'darwin')).toBe(true);
    expect(isSelectionCopyShortcut('c', { ctrl: true }, 'win32')).toBe(true);
    expect(isSelectionCopyShortcut('c', { ctrl: true }, 'linux')).toBe(true);
  });

  it('accepts forwarded Command+C super shape on macOS', () => {
    expect(isSelectionCopyShortcut('c', { super: true }, 'darwin')).toBe(true);
  });

  it('rejects meta and super C on non-macOS platforms', () => {
    expect(isSelectionCopyShortcut('c', { meta: true }, 'darwin')).toBe(false);
    expect(isSelectionCopyShortcut('c', { meta: true }, 'linux')).toBe(false);
    expect(isSelectionCopyShortcut('c', { super: true }, 'win32')).toBe(false);
  });

  it('rejects unrelated shortcuts', () => {
    expect(isSelectionCopyShortcut('o', { ctrl: true }, 'darwin')).toBe(false);
    expect(isSelectionCopyShortcut('o', { super: true }, 'darwin')).toBe(false);
    expect(isSelectionCopyShortcut('x', { meta: true }, 'darwin')).toBe(false);
    expect(isSelectionCopyShortcut('c', {}, 'darwin')).toBe(false);
  });
});

describe('isModifierOnlyKeyEvent', () => {
  it('accepts enhanced modifier-only press and release events', () => {
    expect(isModifierOnlyKeyEvent('', { eventType: 'press', super: true })).toBe(true);
    expect(isModifierOnlyKeyEvent('', { eventType: 'press', ctrl: true })).toBe(true);
    expect(isModifierOnlyKeyEvent('', { eventType: 'press', meta: true })).toBe(true);
    expect(isModifierOnlyKeyEvent('', { eventType: 'release' })).toBe(true);
  });

  it('rejects actionable keys and printable modified shortcuts', () => {
    expect(isModifierOnlyKeyEvent('c', { eventType: 'press', super: true })).toBe(false);
    expect(isModifierOnlyKeyEvent('', { eventType: 'press', leftArrow: true, ctrl: true })).toBe(false);
    expect(isModifierOnlyKeyEvent('', { eventType: 'press', escape: true })).toBe(false);
    expect(isModifierOnlyKeyEvent('', {})).toBe(false);
  });
});

describe('isClipboardPasteShortcut', () => {
  it('accepts Ctrl+V on every platform', () => {
    expect(isClipboardPasteShortcut('v', { ctrl: true }, 'darwin')).toBe(true);
    expect(isClipboardPasteShortcut('v', { ctrl: true }, 'win32')).toBe(true);
    expect(isClipboardPasteShortcut('v', { ctrl: true }, 'linux')).toBe(true);
  });

  it('accepts forwarded Command+V super shape only on macOS', () => {
    expect(isClipboardPasteShortcut('v', { super: true }, 'darwin')).toBe(true);
    expect(isClipboardPasteShortcut('v', { super: true }, 'linux')).toBe(false);
    expect(isClipboardPasteShortcut('v', { super: true }, 'win32')).toBe(false);
  });

  it('rejects unrelated paste shortcuts', () => {
    expect(isClipboardPasteShortcut('c', { super: true }, 'darwin')).toBe(false);
    expect(isClipboardPasteShortcut('o', { ctrl: true }, 'darwin')).toBe(false);
    expect(isClipboardPasteShortcut('v', { meta: true }, 'darwin')).toBe(false);
    expect(isClipboardPasteShortcut('v', { meta: true }, 'linux')).toBe(false);
    expect(isClipboardPasteShortcut('v', {}, 'darwin')).toBe(false);
  });
});
