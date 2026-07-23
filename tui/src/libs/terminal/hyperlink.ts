// OSC 8 hyperlink: `ESC ] 8 ; <params> ; <uri> BEL <text> ESC ] 8 ; ; BEL`.
// The params field is left empty; BEL (`\u0007`) terminates each OSC, matching
// the terminal's other OSC usage (see windowTitle.ts) and staying broadly
// compatible.
const OSC_HYPERLINK_INTRODUCER = '\u001B]8;;';
const OSC_TERMINATOR = '\u0007';

/**
 * Wraps `text` in an OSC 8 hyperlink pointing at `url`.
 *
 * Terminals that support OSC 8 (Windows Terminal, WezTerm, iTerm2, VTE) turn the
 * enclosed text into a clickable link; terminals that don't simply render `text`
 * unchanged. The sequence adds no printed columns, so callers can keep measuring
 * width on the undecorated text.
 */
export function hyperlink(text: string, url: string): string {
  return `${OSC_HYPERLINK_INTRODUCER}${url}${OSC_TERMINATOR}${text}${OSC_HYPERLINK_INTRODUCER}${OSC_TERMINATOR}`;
}

// SGR `4` enables a standard underline; `4:3` upgrades it to a dotted style on
// terminals that support the sub-parameter. Leading with plain `4` matters:
// Ink's slice-ansi tracks the standard underline state and so preserves the
// matching `24` (underline off) reset, whereas a lone `4:3` gets its reset
// dropped and the underline bleeds past the label.
const UNDERLINE_ON = '\u001B[4m';
const DOTTED_UNDERLINE_ON = '\u001B[4:3m';
const UNDERLINE_OFF = '\u001B[24m';

/**
 * Wraps `text` in a dotted underline as an always-visible "this is clickable"
 * affordance.
 *
 * Emits a standard underline (`4`) followed by the dotted refinement (`4:3`):
 * capable terminals (Windows Terminal, WezTerm, kitty) render dotted, others
 * fall back to a straight underline, and either way the `24` reset stays paired
 * so the underline never bleeds past `text`. Like {@link hyperlink}, the escapes
 * add no printed columns.
 */
export function dottedUnderline(text: string): string {
  return `${UNDERLINE_ON}${DOTTED_UNDERLINE_ON}${text}${UNDERLINE_OFF}`;
}
