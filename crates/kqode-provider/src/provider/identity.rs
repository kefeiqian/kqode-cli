use serde::{Deserialize, Serialize};

pub const KIMI_API_BASE_URL: &str = "https://api.moonshot.cn/v1";
pub const OPENAI_API_BASE_URL: &str = "https://api.openai.com/v1";
pub const ANTHROPIC_API_BASE_URL: &str = "https://api.anthropic.com/v1";
pub const DEEPSEEK_API_BASE_URL: &str = "https://api.deepseek.com";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Kimi,
    Openai,
    Anthropic,
    Deepseek,
    Copilot,
    #[serde(rename = "copilot_sdk")]
    CopilotSdk,
    Custom,
}

impl Provider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Kimi => "kimi",
            Self::Openai => "openai",
            Self::Anthropic => "anthropic",
            Self::Deepseek => "deepseek",
            Self::Copilot => "copilot",
            Self::CopilotSdk => "copilot_sdk",
            Self::Custom => "custom",
        }
    }

    pub fn parse(value: &str) -> Result<Self, String> {
        match value {
            "kimi" => Ok(Self::Kimi),
            "openai" => Ok(Self::Openai),
            "anthropic" => Ok(Self::Anthropic),
            "deepseek" => Ok(Self::Deepseek),
            "copilot" => Ok(Self::Copilot),
            "copilot_sdk" => Ok(Self::CopilotSdk),
            "custom" => Ok(Self::Custom),
            _ => Err(value.to_owned()),
        }
    }

    pub fn default_api_base_url(self) -> &'static str {
        match self {
            Self::Kimi => KIMI_API_BASE_URL,
            Self::Openai => OPENAI_API_BASE_URL,
            Self::Anthropic => ANTHROPIC_API_BASE_URL,
            Self::Deepseek => DEEPSEEK_API_BASE_URL,
            Self::Copilot | Self::CopilotSdk | Self::Custom => "",
        }
    }

    pub fn requires_api_key(self) -> bool {
        !matches!(self, Self::Copilot | Self::CopilotSdk)
    }

    pub fn requires_model(self) -> bool {
        true
    }

    pub(crate) fn supports_prompt_cache_key(self) -> bool {
        matches!(self, Self::Openai)
    }

    pub(crate) fn supports_native_tool_descriptions(self) -> bool {
        matches!(
            self,
            Self::Kimi | Self::Openai | Self::Anthropic | Self::Deepseek
        )
    }

    pub(crate) fn display_name(self) -> &'static str {
        match self {
            Self::Kimi => "Kimi",
            Self::Openai => "OpenAI",
            Self::Anthropic => "Anthropic",
            Self::Deepseek => "DeepSeek",
            Self::Copilot => "GitHub Copilot CLI",
            Self::CopilotSdk => "GitHub Copilot SDK",
            Self::Custom => "custom provider",
        }
    }
}
