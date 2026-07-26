export const SgrMouseButton = {
  Left: 0,
  Right: 2,
  LeftDrag: 32,
  RightDrag: 34,
  WheelUp: 64,
  WheelDown: 65,
  WheelLeft: 66,
  WheelUpWithCtrl: 80
} as const;

export function sgrMouseInput(
  button: number,
  column: number,
  row: number,
  eventType: 'M' | 'm' = 'M'
): string {
  return `\u001B[<${button};${column};${row}${eventType}`;
}

export function bracketedPasteInput(text: string): string {
  return `\u001B[200~${text}\u001B[201~`;
}
