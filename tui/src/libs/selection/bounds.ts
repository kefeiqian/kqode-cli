/** A caret position inside the wrapped body-row list: absolute row + display column. */
export type SelectionPoint = { rowIndex: number; column: number };

/** An ordered selection span where `start` precedes or equals `end`. */
export type SelectionBounds = { start: SelectionPoint; end: SelectionPoint };

/**
 * Orders two selection endpoints into `{ start, end }`, where `start` is the
 * earlier point in reading order (top-to-bottom, then left-to-right). A drag can
 * move the focus in either direction, so text reconstruction and the highlight
 * both normalize the anchor/focus pair before using it.
 */
export function selectionBounds(anchor: SelectionPoint, focus: SelectionPoint): SelectionBounds {
  const anchorFirst =
    anchor.rowIndex < focus.rowIndex ||
    (anchor.rowIndex === focus.rowIndex && anchor.column <= focus.column);
  return anchorFirst ? { start: anchor, end: focus } : { start: focus, end: anchor };
}

/** True when the span covers no cells (anchor and focus coincide). */
export function isSelectionEmpty(bounds: SelectionBounds): boolean {
  return bounds.start.rowIndex === bounds.end.rowIndex && bounds.start.column === bounds.end.column;
}
