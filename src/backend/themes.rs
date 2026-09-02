//! Backend handlers for the theme-preference JSON-RPC methods.
//!
//! Thin glue between the protocol layer and the store: the get path returns
//! `null` when unset, and the set path maps the store's tri-state outcome to a
//! wire outcome the picker can render (never throwing into the picker as an
//! opaque transport error). Catalog resolution and unknown-id fallback stay in
//! the TUI.

use crate::protocol::{
    THEME_SET_OUTCOME_INVALID, THEME_SET_OUTCOME_SAVED, THEME_SET_OUTCOME_STORE_FAILED,
    ThemeGetResult, ThemeSetParams, ThemeSetResult,
};
use crate::store::Store;

/// Reads the saved theme id, returning `null` when unset.
///
/// A read error also yields `null` so a transient store hiccup falls back to the
/// default theme rather than failing the request.
#[must_use]
pub(crate) fn theme_get(store: &Store) -> ThemeGetResult {
    ThemeGetResult {
        theme_id: store.theme_id().ok().flatten(),
    }
}

/// Persists the selected theme id, mapping the store's tri-state result to a
/// wire outcome: `saved`, `invalid` (rejected before any write), or
/// `storeFailed` (the write failed).
#[must_use]
pub(crate) fn set_theme(store: &Store, params: ThemeSetParams) -> ThemeSetResult {
    let outcome = match store.set_theme_id(&params.theme_id) {
        Ok(true) => THEME_SET_OUTCOME_SAVED,
        Ok(false) => THEME_SET_OUTCOME_INVALID,
        Err(_) => THEME_SET_OUTCOME_STORE_FAILED,
    };
    ThemeSetResult { outcome }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (tempfile::TempDir, Store) {
        let dir = tempfile::tempdir().expect("temp dir");
        let store = Store::open_or_bootstrap_at(dir.path().join("kqode.db")).expect("bootstrap");
        (dir, store)
    }

    fn set(store: &Store, theme_id: &str) -> &'static str {
        set_theme(
            store,
            ThemeSetParams {
                theme_id: theme_id.to_owned(),
            },
        )
        .outcome
    }

    #[test]
    fn theme_get_is_null_when_unset_and_reflects_a_saved_id() {
        let (_dir, store) = store();
        assert_eq!(theme_get(&store).theme_id, None);
        assert_eq!(set(&store, "nord"), THEME_SET_OUTCOME_SAVED);
        assert_eq!(theme_get(&store).theme_id, Some("nord".to_owned()));
    }

    #[test]
    fn set_theme_rejects_malformed_ids_before_persistence() {
        let (_dir, store) = store();
        assert_eq!(set(&store, "tokyo-night"), THEME_SET_OUTCOME_SAVED);
        // Malformed ids map to `invalid` and leave the prior value untouched.
        assert_eq!(set(&store, "   "), THEME_SET_OUTCOME_INVALID);
        assert_eq!(set(&store, "bad\nid"), THEME_SET_OUTCOME_INVALID);
        assert_eq!(theme_get(&store).theme_id, Some("tokyo-night".to_owned()));
    }

    #[test]
    fn set_theme_accepts_unknown_but_well_formed_ids() {
        let (_dir, store) = store();
        assert_eq!(set(&store, "brand-new-theme"), THEME_SET_OUTCOME_SAVED);
        assert_eq!(
            theme_get(&store).theme_id,
            Some("brand-new-theme".to_owned())
        );
    }
}
