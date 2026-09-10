/// Do not import names that Win32-based tools could reinterpret as devices or paths.
pub(super) fn ordinary(name: &str) -> bool {
    if name.is_empty()
        || name.ends_with([' ', '.'])
        || name.chars().any(|c| {
            c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*')
        })
    {
        return false;
    }
    let stem = name
        .split('.')
        .next()
        .unwrap_or_default()
        .trim_end_matches(' ')
        .to_ascii_uppercase();
    if matches!(
        stem.as_str(),
        "CON" | "PRN" | "AUX" | "NUL" | "CONIN$" | "CONOUT$"
    ) {
        return false;
    }
    for prefix in ["COM", "LPT"] {
        if let Some(suffix) = stem.strip_prefix(prefix)
            && matches!(
                suffix,
                "1" | "2"
                    | "3"
                    | "4"
                    | "5"
                    | "6"
                    | "7"
                    | "8"
                    | "9"
                    | "\u{b9}"
                    | "\u{b2}"
                    | "\u{b3}"
            )
        {
            return false;
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::ordinary;

    #[test]
    fn rejects_devices_and_ambiguous_names_without_renaming_them() {
        for name in [
            "NUL.txt",
            "con",
            "LPT1.log",
            "com\u{b9}",
            "CONOUT$",
            "file.",
            "file ",
            "a:stream",
            "bad?",
        ] {
            assert!(!ordinary(name), "{name}");
        }
        for name in ["main.rs", ".env", "company", "COM10", "hello world"] {
            assert!(ordinary(name), "{name}");
        }
    }
}
