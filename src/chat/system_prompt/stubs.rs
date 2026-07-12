//! Deferred system-prompt sections: registered but empty until their mechanism
//! exists.
//!
//! Each builder returns `None` today, so [`deferred_fragments`] yields an empty
//! vector and the assembled prompt is byte-identical whether or not these are
//! registered. They are listed here — rather than silently omitted — so the
//! catalog of planned sections is discoverable and each carries a note on what
//! will fill it and when. As each mechanism lands, replace the section's `None`
//! with a real [`Fragment`] and add its ordering/volatility metadata.

use super::fragment::Fragment;

/// Collects the deferred sections that currently have content. Every builder
/// returns `None` today, so this is empty; it is wired into the assembler now so
/// that filling any stub later requires no change to the assembly site.
#[must_use]
pub fn deferred_fragments() -> Vec<Fragment> {
    [
        tools(),
        sandbox(),
        mcp_instructions(),
        subagent(),
        output_style(),
        model_variant(),
    ]
    .into_iter()
    .flatten()
    .collect()
}

/// Tool-use and tool-selection guidance. Fills when the tool registry exists.
fn tools() -> Option<Fragment> {
    None
}

/// Sandbox mode, approval policy, and network gating. Fills when sandbox-lite
/// and the policy engine exist.
fn sandbox() -> Option<Fragment> {
    None
}

/// Per-server MCP instructions. Fills when MCP core exists. Expected to be
/// `Volatility::Volatile` — servers connect/disconnect between turns, so this
/// section must stay out of the stable prefix.
fn mcp_instructions() -> Option<Fragment> {
    None
}

/// Subagent / plan / coordinator prompts. Fills at the subagent milestone.
fn subagent() -> Option<Fragment> {
    None
}

/// User-selectable output styles. Fills when the output-style system exists.
fn output_style() -> Option<Fragment> {
    None
}

/// Provider/model-specific persona variants. Owned by the provider layer; fills
/// when per-model prompt variance is introduced there.
fn model_variant() -> Option<Fragment> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deferred_stubs_contribute_nothing() {
        assert!(
            deferred_fragments().is_empty(),
            "every deferred section returns None until its mechanism ships"
        );
    }
}
