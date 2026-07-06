import { describe, expect, it } from 'vitest';
import {
  appendRecallEntry,
  createRecallRing,
  recallNext,
  recallPrevious
} from '@libs/composer/recallRing.ts';

function appendAll(values: readonly string[], maxSize?: number) {
  return values.reduce((ring, text) => appendRecallEntry(ring, text), createRecallRing(maxSize));
}

describe('recallRing', () => {
  it('recalls older entries then returns toward newest and the draft', () => {
    let ring = appendAll(['foo', 'bar']);

    let result = recallPrevious(ring, 'draft');
    expect(result.text).toBe('bar');
    ring = result.ring;

    result = recallPrevious(ring, 'ignored edit');
    expect(result.text).toBe('foo');
    ring = result.ring;

    result = recallNext(ring);
    expect(result.text).toBe('bar');
    ring = result.ring;

    result = recallNext(ring);
    expect(result.text).toBe('draft');
  });

  it('captures the current draft once and no-ops at both ends', () => {
    let ring = appendAll(['foo']);

    let result = recallPrevious(ring, 'half');
    expect(result.text).toBe('foo');
    ring = result.ring;

    result = recallPrevious(ring, 'changed while recalled');
    expect(result.text).toBe('foo');
    ring = result.ring;

    result = recallNext(ring);
    expect(result.text).toBe('half');
    ring = result.ring;

    result = recallNext(ring);
    expect(result.text).toBeNull();
  });

  it('collapses consecutive duplicates but preserves non-consecutive repeats', () => {
    const ring = appendAll(['foo', 'foo', 'bar', 'foo']);

    expect(ring.entries).toEqual(['foo', 'bar', 'foo']);
  });

  it('never exceeds its max size', () => {
    const ring = appendAll(['one', 'two', 'three'], 2);

    expect(ring.entries).toEqual(['two', 'three']);
  });

  it('discards edits to recalled entries while preserving the original draft', () => {
    let ring = appendAll(['older', 'newer']);

    let result = recallPrevious(ring, 'draft');
    expect(result.text).toBe('newer');
    ring = result.ring;

    result = recallPrevious(ring, 'edited recalled newer');
    expect(result.text).toBe('older');
    ring = result.ring;

    result = recallNext(ring);
    expect(result.text).toBe('newer');
    ring = result.ring;

    result = recallNext(ring);
    expect(result.text).toBe('draft');
  });
});
