//! Bounded prompt fragments and their stable-first ordering.
//!
//! Each system-prompt section produces an optional [`Fragment`] carrying the
//! metadata from KQode's documented context-fragment model (see
//! `docs/kqode_architecture_spec.md`, Context system): a `source`, an advisory
//! token estimate, an ordering `priority`, a `volatility` class, and a
//! `persistence` class. [`order_fragments`] sorts fragments most-stable-first so
//! a provider that does implicit prefix caching sees the longest possible stable
//! prefix; [`render`] concatenates them into one system message. In-process
//! memoization is deferred; the metadata needed for it is carried now.

/// Origin of a fragment's content. An enum (not a string label) so the section
/// catalog stays searchable and typo-free.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum FragmentSource {
    /// The KQode persona/identity.
    Identity,
    /// Response tone and terminal-formatting guidance.
    Tone,
    /// Safety directives (URL guessing, untrusted-content handling, refusals).
    Safety,
    /// The user's local memory block (already framed as untrusted by the caller).
    Memory,
    /// The bounded environment block (OS, cwd, time, model, git).
    Environment,
}

impl FragmentSource {
    /// Stable lowercase label for trace logs.
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Identity => "identity",
            Self::Tone => "tone",
            Self::Safety => "safety",
            Self::Memory => "memory",
            Self::Environment => "environment",
        }
    }
}

/// Whether a fragment's content is stable across turns or changes per turn.
/// Stable fragments form the cacheable prefix; volatile fragments sort last.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Volatility {
    /// Byte-identical across turns while its inputs are unchanged.
    Stable,
    /// Changes per turn (e.g. the current timestamp), so it breaks any prefix
    /// cache and must sort after every stable fragment.
    Volatile,
}

const fn volatility_rank(volatility: Volatility) -> u8 {
    match volatility {
        Volatility::Stable => 0,
        Volatility::Volatile => 1,
    }
}

/// Whether a fragment persists across turns or is recomputed each turn. Carried
/// for later in-process memoization; today it is emitted only to trace logs.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Persistence {
    /// Same value across the session unless its source changes.
    Persistent,
    /// Rebuilt every turn.
    PerTurn,
}

/// An advisory, non-authoritative per-fragment token estimate.
///
/// Deliberately a newtype (not a bare `usize`) so it cannot be accidentally
/// summed into a budget or drop decision: the authoritative budget is
/// `crate::chat::token_estimate` over the whole assembled message list, whose
/// per-message overhead a per-fragment sum can never reproduce. Read it for
/// diagnostics, never for control flow.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct AdvisoryTokens(pub usize);

/// A bounded unit of system-prompt content plus its ordering/cache metadata.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Fragment {
    /// Where the content came from.
    pub source: FragmentSource,
    /// The rendered text for this section.
    pub content: String,
    /// Stable vs volatile — the primary ordering key.
    pub volatility: Volatility,
    /// Whether the value is reused across turns (forward-looking metadata).
    pub persistence: Persistence,
    /// Lower sorts earlier within a volatility class; ties keep declared order.
    pub priority: u16,
    /// Advisory token estimate; never fed into a budget decision.
    pub est_tokens: AdvisoryTokens,
}

impl Fragment {
    /// Builds a fragment, deriving the advisory token estimate from `content`.
    /// `priority` orders it within its `volatility` class.
    #[must_use]
    pub fn new(
        source: FragmentSource,
        content: impl Into<String>,
        volatility: Volatility,
        persistence: Persistence,
        priority: u16,
    ) -> Self {
        let content = content.into();
        let est_tokens = AdvisoryTokens(advisory_token_estimate(&content));
        Self {
            source,
            content,
            volatility,
            persistence,
            priority,
            est_tokens,
        }
    }
}

/// Rough per-fragment token estimate (`chars / 4`), matching the character
/// heuristic in [`crate::chat::token_estimate`] but WITHOUT its per-message
/// overhead — hence advisory only.
fn advisory_token_estimate(content: &str) -> usize {
    content.chars().count() / 4
}

/// Orders fragments most-stable-first: all [`Volatility::Stable`] fragments
/// precede all [`Volatility::Volatile`] fragments; within a class, ascending
/// `priority`, and equal priorities preserve their input (declared) order.
#[must_use]
pub fn order_fragments(mut fragments: Vec<Fragment>) -> Vec<Fragment> {
    // `sort_by_key` is stable, so equal keys keep their declared order.
    fragments.sort_by_key(|fragment| (volatility_rank(fragment.volatility), fragment.priority));
    fragments
}

/// Concatenates ordered fragment contents into one system-prompt string,
/// separated by blank lines. Empty/absent fragments are omitted upstream.
#[must_use]
pub fn render(fragments: &[Fragment]) -> String {
    fragments
        .iter()
        .map(|fragment| fragment.content.as_str())
        .collect::<Vec<_>>()
        .join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn frag(
        source: FragmentSource,
        content: &str,
        volatility: Volatility,
        priority: u16,
    ) -> Fragment {
        Fragment::new(
            source,
            content,
            volatility,
            Persistence::Persistent,
            priority,
        )
    }

    #[test]
    fn stable_sorts_before_volatile() {
        let ordered = order_fragments(vec![
            frag(FragmentSource::Environment, "env", Volatility::Volatile, 0),
            frag(FragmentSource::Identity, "id", Volatility::Stable, 0),
        ]);
        assert_eq!(ordered[0].source, FragmentSource::Identity);
        assert_eq!(ordered[1].source, FragmentSource::Environment);
    }

    #[test]
    fn priority_orders_within_a_volatility_class() {
        let ordered = order_fragments(vec![
            frag(FragmentSource::Safety, "safety", Volatility::Stable, 2),
            frag(FragmentSource::Identity, "id", Volatility::Stable, 0),
            frag(FragmentSource::Tone, "tone", Volatility::Stable, 1),
        ]);
        let sources: Vec<_> = ordered.iter().map(|fragment| fragment.source).collect();
        assert_eq!(
            sources,
            vec![
                FragmentSource::Identity,
                FragmentSource::Tone,
                FragmentSource::Safety,
            ]
        );
    }

    #[test]
    fn equal_priority_preserves_declared_order() {
        let ordered = order_fragments(vec![
            frag(FragmentSource::Tone, "first", Volatility::Stable, 5),
            frag(FragmentSource::Safety, "second", Volatility::Stable, 5),
        ]);
        assert_eq!(ordered[0].content, "first");
        assert_eq!(ordered[1].content, "second");
    }

    #[test]
    fn no_volatile_fragment_precedes_a_stable_one() {
        let ordered = order_fragments(vec![
            frag(FragmentSource::Environment, "env", Volatility::Volatile, 0),
            frag(FragmentSource::Memory, "mem", Volatility::Stable, 9),
            frag(FragmentSource::Identity, "id", Volatility::Stable, 0),
        ]);
        let first_volatile = ordered
            .iter()
            .position(|fragment| fragment.volatility == Volatility::Volatile)
            .expect("a volatile fragment");
        let last_stable = ordered
            .iter()
            .rposition(|fragment| fragment.volatility == Volatility::Stable)
            .expect("a stable fragment");
        assert!(first_volatile > last_stable);
    }

    #[test]
    fn empty_input_orders_to_empty() {
        assert!(order_fragments(vec![]).is_empty());
    }

    #[test]
    fn render_joins_with_blank_lines() {
        let out = render(&[
            frag(FragmentSource::Identity, "A", Volatility::Stable, 0),
            frag(FragmentSource::Tone, "B", Volatility::Stable, 1),
        ]);
        assert_eq!(out, "A\n\nB");
    }

    #[test]
    fn advisory_token_estimate_is_char_quarter() {
        let fragment = frag(FragmentSource::Identity, "abcdefgh", Volatility::Stable, 0);
        assert_eq!(fragment.est_tokens, AdvisoryTokens(2));
    }
}
