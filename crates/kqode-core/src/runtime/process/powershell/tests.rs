use base64::{Engine, engine::general_purpose::STANDARD};

use super::{
    PowerShellError,
    command::{MAX_SCRIPT_UTF16_UNITS, UTF8_PREAMBLE, encode_script},
};

#[test]
fn transport_preserves_quotes_newlines_and_unicode_without_interpolation() {
    let script =
        "[Console]::WriteLine('quoted \"word\"; $literal ` & |')\r\n# \u{4e2d}\u{6587} \u{1f600}";
    let bytes = STANDARD.decode(encode_script(script).unwrap()).unwrap();
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();
    let bootstrap = String::from_utf16(&units).unwrap();
    assert!(bootstrap.starts_with(UTF8_PREAMBLE));
    let payload = bootstrap
        .split("FromBase64String('")
        .nth(1)
        .unwrap()
        .split('\'')
        .next()
        .unwrap();
    let bytes = STANDARD.decode(payload).unwrap();
    let units: Vec<u16> = bytes
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();
    assert_eq!(String::from_utf16(&units).unwrap(), script);
}

#[test]
fn blank_scripts_are_rejected() {
    assert!(matches!(
        encode_script(" \r\n\t"),
        Err(PowerShellError::EmptyCommand)
    ));
}

#[test]
fn exact_transport_limit_is_enforced_in_utf16_units() {
    assert!(encode_script(&"#".repeat(MAX_SCRIPT_UTF16_UNITS)).is_ok());
    assert!(
        encode_script(&"#".repeat(MAX_SCRIPT_UTF16_UNITS))
            .unwrap()
            .len()
            < 30_000
    );
    assert!(matches!(
        encode_script(&"#".repeat(MAX_SCRIPT_UTF16_UNITS + 1)),
        Err(PowerShellError::CommandTooLong { .. })
    ));
    assert!(matches!(
        encode_script(&"\u{1f600}".repeat(MAX_SCRIPT_UTF16_UNITS / 2 + 1)),
        Err(PowerShellError::CommandTooLong { .. })
    ));
}

#[cfg(not(windows))]
#[test]
fn other_platforms_do_not_fall_back_to_unix_shells() {
    assert!(matches!(
        super::PowerShell::resolve(None),
        Err(PowerShellError::UnsupportedPlatform)
    ));
}
