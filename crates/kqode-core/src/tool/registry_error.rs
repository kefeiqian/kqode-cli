use std::fmt;

/// Invalid registry configuration.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RegistryError {
    EmptyCanonicalName,
    InvalidCanonicalName(String),
    DuplicateCanonicalName(String),
}

impl fmt::Display for RegistryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyCanonicalName => formatter.write_str("tool canonical name cannot be empty"),
            Self::InvalidCanonicalName(name) => {
                write!(
                    formatter,
                    "tool canonical name contains outer whitespace: {name:?}"
                )
            }
            Self::DuplicateCanonicalName(name) => {
                write!(formatter, "duplicate tool canonical name: {name}")
            }
        }
    }
}

impl std::error::Error for RegistryError {}
