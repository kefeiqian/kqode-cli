/** Default maximum number of submissions kept in recall history. */
export const DEFAULT_RECALL_RING_MAX_SIZE = 100;
const NO_ACTIVE_RECALL_INDEX = -1;

/** Immutable recall history plus navigation state. */
export type RecallRing = {
  entries: readonly string[];
  activeIndex: number;
  draft: string | null;
  maxSize: number;
};

/** Result of a recall navigation attempt. */
export type RecallNavigationResult = {
  ring: RecallRing;
  text: string | null;
};

/** Creates an empty bounded recall ring. */
export function createRecallRing(maxSize = DEFAULT_RECALL_RING_MAX_SIZE): RecallRing {
  return { entries: [], activeIndex: NO_ACTIVE_RECALL_INDEX, draft: null, maxSize };
}

/** Appends a submitted line verbatim, collapsing consecutive duplicates. */
export function appendRecallEntry(ring: RecallRing, text: string): RecallRing {
  const withoutDuplicate = ring.entries.at(-1) === text ? ring.entries : [...ring.entries, text];
  return {
    entries: withoutDuplicate.slice(Math.max(0, withoutDuplicate.length - ring.maxSize)),
    activeIndex: NO_ACTIVE_RECALL_INDEX,
    draft: null,
    maxSize: ring.maxSize
  };
}

/** Moves toward older submissions, capturing `draft` on the first recall. */
export function recallPrevious(ring: RecallRing, draft: string): RecallNavigationResult {
  if (ring.entries.length === 0) {
    return { ring, text: null };
  }

  const firstRecall = ring.activeIndex === NO_ACTIVE_RECALL_INDEX;
  const activeIndex = firstRecall ? ring.entries.length - 1 : Math.max(0, ring.activeIndex - 1);
  const nextRing = {
    ...ring,
    activeIndex,
    draft: firstRecall ? draft : ring.draft
  };
  return { ring: nextRing, text: nextRing.entries[activeIndex] ?? null };
}

/** Moves toward newer submissions, then restores the captured draft past newest. */
export function recallNext(ring: RecallRing): RecallNavigationResult {
  if (ring.activeIndex === NO_ACTIVE_RECALL_INDEX) {
    return { ring, text: null };
  }

  if (ring.activeIndex < ring.entries.length - 1) {
    const activeIndex = ring.activeIndex + 1;
    return { ring: { ...ring, activeIndex }, text: ring.entries[activeIndex] ?? null };
  }

  return {
    ring: { ...ring, activeIndex: NO_ACTIVE_RECALL_INDEX, draft: null },
    text: ring.draft ?? ''
  };
}
