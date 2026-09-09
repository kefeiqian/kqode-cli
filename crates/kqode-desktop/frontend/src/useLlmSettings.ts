import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  LlmSettings,
  Provider,
  ProviderConnectionStatus,
} from "./types";

export function useLlmSettings() {
  const [settings, setSettings] = useState<LlmSettings>();
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState<string>();
  const [modelsLoading, setModelsLoading] = useState(false);
  const chatActivationId = useRef(0);

  const loadModels = async (
    provider: Provider,
    forceRefresh: boolean,
    isCancelled: () => boolean = () => false,
  ): Promise<string[]> => {
    setModelsLoading(true);
    setModelsError(undefined);
    try {
      const availableModels = await invoke<string[]>("list_models", {
        forceRefresh,
        provider,
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
    if (!settings) return;

    let cancelled = false;
    void loadModels(settings.provider, false, () => cancelled);

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
    setIsLoading(true);
    setLoadError(undefined);
    try {
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
    } catch (error) {
      if (activationId === chatActivationId.current) {
        setLoadError(`Could not load settings: ${String(error)}`);
      }
      return undefined;
    } finally {
      if (activationId === chatActivationId.current) {
        setIsLoading(false);
      }
    }
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
    refreshModels: (provider: Provider) => loadModels(provider, true),
    saveSettings,
    settings,
    testProviderConnection: (provider: Provider) =>
      invoke<ProviderConnectionStatus>("test_provider_connection", {
        provider,
      }),
  };
}
