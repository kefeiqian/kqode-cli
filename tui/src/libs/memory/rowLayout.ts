/**
 * Shared fixed-width row layout helpers for the `/memory` surface tables.
 * Kept pure (data → string) and outside atoms so the surface can render within
 * the safe content width without state cycles.
 */

/** Truncates collapsed whitespace text to `width`, adding an ellipsis if cut. */
export function truncate(text: string, width: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= width) {
    return normalized;
  }
  if (width <= 1) {
    return normalized.slice(0, width);
  }
  return `${normalized.slice(0, width - 1)}…`;
}

/** Right-pads `text` with spaces to `width`. */
export function pad(text: string, width: number): string {
  return text.padEnd(width, ' ');
}

/** Renders an epoch-ms timestamp as a compact relative age (`now`, `5m ago`). */
export function formatAge(timestampMs: number): string {
  const deltaMs = Math.max(0, Date.now() - timestampMs);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}

/** Renders an optional 0..1 confidence as a percentage, or `—` when absent. */
export function formatConfidence(confidence: number | null): string {
  if (confidence === null) {
    return '—';
  }
  return `${Math.round(confidence * 100)}%`;
}
