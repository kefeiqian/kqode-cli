import type { Provider } from "./types";

export type ProviderOption = {
  id: Provider;
  name: string;
  detail: string;
};

export const PROVIDERS: ProviderOption[] = [
  {
    id: "kimi",
    name: "Kimi",
    detail: "Moonshot AI",
  },
  {
    id: "openai",
    name: "ChatGPT",
    detail: "OpenAI",
  },
  {
    id: "anthropic",
    name: "Claude",
    detail: "Anthropic",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    detail: "DeepSeek API",
  },
  {
    id: "copilot",
    name: "Copilot CLI",
    detail: "Local GitHub Copilot CLI",
  },
  {
    id: "copilot_sdk",
    name: "Copilot SDK",
    detail: "GitHub Copilot SDK",
  },
  {
    id: "custom",
    name: "Custom",
    detail: "OpenAI-compatible API",
  },
];

export function addHighlightedModel(models: string[], model: string) {
  return Array.from(new Set([...models, model]));
}
