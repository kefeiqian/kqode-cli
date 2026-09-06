import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LlmSettings, Provider } from "./types";

export function useLlmSettings() {
  const [settings, setSettings] = useState<LlmSettings>();
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState<string>();
  const [modelsLoading, setModelsLoading] = useState(false);
  const chatActivationId = useRef(0);

  const loadModels = async (
    currentSettings: LlmSettings,
    forceRefresh: boolean,
    isCancelled: () => boolean = () => false,
  ): Promise<string[]> => {
    setModelsLoading(true);
    setModelsError(undefined);
    try {
      const availableModels = await invoke<string[]>("list_models", {
        forceRefresh,
        settings: {
          provider: currentSettings.provider,
          apiBaseUrl: currentSettings.apiBaseUrl,
          apiKey: currentSettings.apiKey,
          apiKeyPreview: currentSettings.apiKeyPreview,
          highlightedModels: currentSettings.highlightedModels,
          model: currentSettings.model,
        },
      });
      if (isCancelled()) return [];
      setModels(availableModels);
      return availableModels;
    } catch (error) {
      if (!isCancelled()) {
        setModels([]);
        setModelsError(`Could not load models: ${String(error)}`);
      }
      return [];
    } finally {
      if (!isCancelled()) setModelsLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    void invoke<LlmSettings>("load_settings")
      .then((stored) => {
        if (!cancelled) setSettings(stored);
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(`Could not load settings: ${String(error)}`);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!settings) return;

    let cancelled = false;
    void loadModels(settings, false, () => cancelled);

    return () => {
      cancelled = true;
    };
  }, [
    settings?.apiBaseUrl,
    settings?.apiKey,
    settings?.apiKeyPreview,
    settings?.provider,
  ]);

  const saveSettings = async (next: LlmSettings) => {
    const activationId = ++chatActivationId.current;
    await invoke("save_settings", { settings: next });
    const savedSettings = await invoke<LlmSettings>("load_provider_settings", {
      provider: next.provider,
    });
    if (activationId === chatActivationId.current) {
      setSettings(savedSettings);
    }
  };

  const activateChatConfiguration = async (
    provider: Provider,
    model?: string,
  ) => {
    const activationId = ++chatActivationId.current;
    const providerSettings = await invoke<LlmSettings>(
      "load_provider_settings",
      { provider },
    );
    if (activationId === chatActivationId.current) {
      setSettings({
        ...providerSettings,
        model: model ?? providerSettings.model,
      });
    }
    return providerSettings;
  };

  const chatModels = Array.from(new Set(settings?.highlightedModels ?? []))
    .filter((model): model is string => Boolean(model))
    .sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" }),
    );

  return {
    activateChatConfiguration,
    chatModels,
    isLoading,
    loadError,
    models,
    modelsError,
    modelsLoading,
    loadProviderSettings: (provider: Provider) =>
      invoke<LlmSettings>("load_provider_settings", { provider }),
    refreshModels: (currentSettings: LlmSettings) =>
      loadModels(currentSettings, true),
    saveSettings,
    settings,
  };
}
