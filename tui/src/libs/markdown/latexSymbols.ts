/**
 * Curated LaTeX → Unicode maps and helpers for terminal-readable math.
 *
 * Every glyph here is a single precomposed code point (never a combining
 * sequence), so it measures as one grapheme of width >= 1 and stays safe under
 * the shared safe-content-width model. Anything without a precomposed form
 * falls back to plain caret/underscore notation rather than emitting combining
 * marks.
 */

/** Greek letters — lower, upper, and the common `var` variants. */
const GREEK: Readonly<Record<string, string>> = Object.freeze({
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ',
  eta: 'η', theta: 'θ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν',
  xi: 'ξ', omicron: 'ο', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ',
  phi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Alpha: 'Α', Beta: 'Β', Gamma: 'Γ', Delta: 'Δ', Epsilon: 'Ε', Zeta: 'Ζ',
  Eta: 'Η', Theta: 'Θ', Iota: 'Ι', Kappa: 'Κ', Lambda: 'Λ', Mu: 'Μ', Nu: 'Ν',
  Xi: 'Ξ', Omicron: 'Ο', Pi: 'Π', Rho: 'Ρ', Sigma: 'Σ', Tau: 'Τ', Upsilon: 'Υ',
  Phi: 'Φ', Chi: 'Χ', Psi: 'Ψ', Omega: 'Ω',
  varepsilon: 'ε', vartheta: 'ϑ', varphi: 'φ', varrho: 'ϱ', varsigma: 'ς', varpi: 'ϖ'
});

/** Named commands: operators, relations, arrows, set/logic, big operators. */
const COMMANDS: Readonly<Record<string, string>> = Object.freeze({
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', ast: '∗', star: '⋆',
  leq: '≤', le: '≤', geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈',
  equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫',
  to: '→', rightarrow: '→', Rightarrow: '⇒', leftarrow: '←', Leftarrow: '⇐',
  leftrightarrow: '↔', Leftrightarrow: '⇔', mapsto: '↦', implies: '⟹', iff: '⟺',
  in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇',
  cup: '∪', cap: '∩', emptyset: '∅', setminus: '∖', forall: '∀', exists: '∃',
  neg: '¬', lnot: '¬', land: '∧', lor: '∨', wedge: '∧', vee: '∨',
  sum: '∑', prod: '∏', int: '∫', oint: '∮', partial: '∂', nabla: '∇',
  infty: '∞', sqrt: '√', angle: '∠', perp: '⊥', parallel: '∥',
  top: '⊤', bot: '⊥', cdots: '⋯', ldots: '…', dots: '…', vdots: '⋮',
  hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', deg: '°',
  langle: '⟨', rangle: '⟩', lceil: '⌈', rceil: '⌉', lfloor: '⌊', rfloor: '⌋'
});

/** Precomposed superscript glyphs — no combining marks. */
const SUPERSCRIPT: Readonly<Record<string, string>> = Object.freeze({
  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶',
  '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾',
  n: 'ⁿ', i: 'ⁱ', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', f: 'ᶠ', g: 'ᵍ',
  h: 'ʰ', j: 'ʲ', k: 'ᵏ', l: 'ˡ', m: 'ᵐ', o: 'ᵒ', p: 'ᵖ', r: 'ʳ', s: 'ˢ',
  t: 'ᵗ', u: 'ᵘ', v: 'ᵛ', w: 'ʷ', x: 'ˣ', y: 'ʸ', z: 'ᶻ', T: 'ᵀ'
});

/** Precomposed subscript glyphs — no combining marks. */
const SUBSCRIPT: Readonly<Record<string, string>> = Object.freeze({
  '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆',
  '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎',
  a: 'ₐ', e: 'ₑ', h: 'ₕ', i: 'ᵢ', j: 'ⱼ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ',
  o: 'ₒ', p: 'ₚ', r: 'ᵣ', s: 'ₛ', t: 'ₜ', u: 'ᵤ', v: 'ᵥ', x: 'ₓ'
});

/** Whole-token superscript forms for commands (e.g. transpose `x^\top` → xᵀ). */
const SUPERSCRIPT_COMMANDS: Readonly<Record<string, string>> = Object.freeze({
  '\\top': 'ᵀ', '\\intercal': 'ᵀ', '\\prime': '′', '\\circ': '°'
});

/** Looks up a Greek letter or named command; returns undefined if unknown. */
export function lookupCommand(name: string): string | undefined {
  return GREEK[name] ?? COMMANDS[name];
}

/**
 * Renders `inner` as superscript using precomposed glyphs. Returns caret
 * notation (`^inner` / `^(inner)`) when any character lacks a precomposed form,
 * so no combining marks are ever emitted.
 */
export function toSuperscript(inner: string): string {
  const command = SUPERSCRIPT_COMMANDS[inner.trim()];
  if (command !== undefined) return command;
  return scriptOrFallback(inner, SUPERSCRIPT, '^');
}

/** Subscript counterpart of {@link toSuperscript}. */
export function toSubscript(inner: string): string {
  return scriptOrFallback(inner, SUBSCRIPT, '_');
}

function scriptOrFallback(
  inner: string,
  map: Readonly<Record<string, string>>,
  marker: string
): string {
  const chars = [...inner];
  const converted: string[] = [];
  for (const char of chars) {
    const glyph = map[char];
    if (glyph === undefined) {
      return chars.length > 1 ? `${marker}(${inner})` : `${marker}${inner}`;
    }
    converted.push(glyph);
  }
  return converted.join('');
}
