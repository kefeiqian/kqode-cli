//! Build-time environment identity, mirroring the TUI's `__DEV__` / `__TEST__` /
//! `__PROD__` flags.
//!
//! `build.rs` reads the `KQODE_ENV` variable and exposes the deploy target to the
//! compiler as the `__DEV__` or `__PROD__` cfg; test-harness detection uses the
//! built-in `cfg(test)`. Gate environment-specific code with `#[cfg(__PROD__)]` /
//! `#[cfg(test)]` for true conditional compilation, or read [`BuildEnv::current`]
//! for a runtime value (for example, when logging the active environment).
//!
//! A plain `cargo build` is `__DEV__`; `cargo test` adds `cfg(test)` on top. A
//! `KQODE_ENV=test` build still compiles as `__DEV__` — the "test" environment is
//! the built-in `cfg(test)`, not a deploy target.

/// Build variable that selects the environment. Kept in sync with `build.rs`.
pub const ENV_VAR: &str = "KQODE_ENV";

/// The environments KQode is built for, selected by [`ENV_VAR`] at build time.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BuildEnv {
    /// Source checkout run with Cargo; the default when `KQODE_ENV` is unset.
    Dev,
    /// Test build where product-wide test seams are active.
    Test,
    /// Packaged release that embeds and runs the backend.
    Prod,
}

impl BuildEnv {
    /// The environment this crate was compiled for, resolved from the `cfg(test)`
    /// / `__PROD__` / `__DEV__` cfgs.
    ///
    /// `cfg(test)` takes priority (unit tests always compile with it); otherwise
    /// `__PROD__` selects [`BuildEnv::Prod`] and everything else — including when
    /// no cfg is set, e.g. tooling that does not run `build.rs` — is
    /// [`BuildEnv::Dev`].
    #[must_use]
    pub const fn current() -> Self {
        #[cfg(test)]
        const CURRENT: BuildEnv = BuildEnv::Test;
        #[cfg(all(not(test), __PROD__))]
        const CURRENT: BuildEnv = BuildEnv::Prod;
        #[cfg(all(not(test), not(__PROD__)))]
        const CURRENT: BuildEnv = BuildEnv::Dev;

        CURRENT
    }

    /// The lowercase name of this environment (`"dev"`, `"test"`, or `"prod"`).
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Dev => "dev",
            Self::Test => "test",
            Self::Prod => "prod",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::BuildEnv;

    #[test]
    fn current_is_test_under_cargo_test() {
        // Unit tests always compile with the built-in `cfg(test)`, which takes
        // priority in `current()`.
        assert_eq!(BuildEnv::current(), BuildEnv::Test);
    }

    #[test]
    fn as_str_maps_each_variant() {
        assert_eq!(BuildEnv::Dev.as_str(), "dev");
        assert_eq!(BuildEnv::Test.as_str(), "test");
        assert_eq!(BuildEnv::Prod.as_str(), "prod");
    }
}
