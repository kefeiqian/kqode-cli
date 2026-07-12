use super::*;
use crate::test_env;
use std::ffi::OsString;
use std::sync::MutexGuard;

// USERPROFILE / HOME are process-global; serialize env-touching tests.
fn env_guard() -> MutexGuard<'static, ()> {
    test_env::lock()
}

/// Saves and restores the home-related env vars so a test never leaks state
/// into its siblings (they share the process environment).
struct HomeEnv {
    userprofile: Option<OsString>,
    home: Option<OsString>,
}

impl HomeEnv {
    fn save() -> Self {
        Self {
            userprofile: env::var_os("USERPROFILE"),
            home: env::var_os("HOME"),
        }
    }

    fn set_home(value: &str) {
        unsafe {
            env::set_var("USERPROFILE", value);
            env::set_var("HOME", value);
        }
    }

    fn clear_home() {
        unsafe {
            env::remove_var("USERPROFILE");
            env::remove_var("HOME");
        }
    }
}

impl Drop for HomeEnv {
    fn drop(&mut self) {
        unsafe {
            restore("USERPROFILE", self.userprofile.as_ref());
            restore("HOME", self.home.as_ref());
        }
    }
}

unsafe fn restore(key: &str, value: Option<&OsString>) {
    unsafe {
        match value {
            Some(value) => env::set_var(key, value),
            None => env::remove_var(key),
        }
    }
}

#[test]
fn kqode_home_joins_home_with_dotkqode() {
    let _guard = env_guard();
    let _saved = HomeEnv::save();
    let base = env::temp_dir().join("kqode-home-test");
    HomeEnv::set_home(base.to_str().unwrap());
    assert_eq!(kqode_home(), Some(base.join(KQODE_HOME_DIRNAME)));
}

#[test]
fn eval_dir_joins_kqode_home_with_eval() {
    let _guard = env_guard();
    let _saved = HomeEnv::save();
    let base = env::temp_dir().join("kqode-eval-test");
    HomeEnv::set_home(base.to_str().unwrap());
    assert_eq!(
        eval_dir(),
        Some(base.join(KQODE_HOME_DIRNAME).join(super::EVAL_DIRNAME))
    );
}

#[test]
fn unset_home_env_yields_none_without_panicking() {
    let _guard = env_guard();
    let _saved = HomeEnv::save();
    HomeEnv::clear_home();
    assert_eq!(home_dir(), None);
    assert_eq!(kqode_home(), None);
    assert_eq!(db_path(), None);
}

#[test]
fn empty_home_env_is_treated_as_absent() {
    let _guard = env_guard();
    let _saved = HomeEnv::save();
    HomeEnv::set_home("");
    assert_eq!(home_dir(), None);
}
