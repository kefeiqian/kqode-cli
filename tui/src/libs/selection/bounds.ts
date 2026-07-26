/** A position inside the absolute wrapped body-row list. */
export type SelectionPoint = { rowIndex: number; column: number };

/** An ordered selection span where `start` precedes or equals `end`. */
export type SelectionBounds = { start: SelectionPoint; end: SelectionPoint };

/** Orders a possibly backwards drag into reading order. */
export function selectionBounds(anchor: SelectionPoint, focus: SelectionPoint): SelectionBounds {
  const anchorFirst =
    anchor.rowIndex < focus.rowIndex ||
    (anchor.rowIndex === focus.rowIndex && anchor.column <= focus.column);
  return anchorFirst ? { start: anchor, end: focus } : { start: focus, end: anchor };
}

/** Returns whether the selection covers no terminal cells. */
export function isSelectionEmpty(bounds: SelectionBounds): boolean {
  return bounds.start.rowIndex === bounds.end.rowIndex && bounds.start.column === bounds.end.column;
}
