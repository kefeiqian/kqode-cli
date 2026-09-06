import { FormEvent, useEffect, useState } from "react";
import { addHighlightedModel } from "../providers";
import type { LlmSettings, Provider } from "../types";
import { ApiKeySettingsField } from "./ApiKeySettingsField";
import { CustomProviderUrlField } from "./CustomProviderUrlField";
import { ModelSettingsField } from "./ModelSettingsField";
import { ProviderPicker } from "./ProviderPicker";
import "./SettingsPage.css";

type SettingsPageProps = {
  initialSettings: LlmSettings;
  isLoading: boolean;
  loadError?: string;
  models: string[];
  modelsError?: string;
  modelsLoading: boolean;
  onDirtyChange: (isDirty: boolean) => void;
  onLoadProvider: (provider: Provider) => Promise<LlmSettings>;
  onRefreshModels: (settings: LlmSettings) => Promise<string[]>;
  onSave: (settings: LlmSettings) => Promise<void>;
};

export function SettingsPage({
  initialSettings,
  isLoading,
  loadError,
  models,
  modelsError,
  modelsLoading,
  onDirtyChange,
  onLoadProvider,
  onRefreshModels,
  onSave,
}: SettingsPageProps) {
  const [draft, setDraft] = useState(initialSettings);
  const [draftModels, setDraftModels] = useState(models);
  const [saveStatus, setSaveStatus] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [isSwitchingProvider, setIsSwitchingProvider] = useState(false);
  const usesKeylessCopilot =
    draft.provider === "copilot" || draft.provider === "copilot_sdk";
  const isDirty =
    draft.provider !== initialSettings.provider ||
    draft.apiBaseUrl !== initialSettings.apiBaseUrl ||
    draft.apiKey !== initialSettings.apiKey ||
    draft.apiKeyPreview !== initialSettings.apiKeyPreview ||
    draft.model !== initialSettings.model ||
    draft.highlightedModels.length !==
      initialSettings.highlightedModels.length ||
    draft.highlightedModels.some(
      (model, index) => model !== initialSettings.highlightedModels[index],
    );

  useEffect(() => {
    setDraft(initialSettings);
  }, [initialSettings]);

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange(false);
    },
    [onDirtyChange],
  );

  useEffect(() => {
    const draftMatchesSaved =
      draft.provider === initialSettings.provider &&
      draft.apiBaseUrl === initialSettings.apiBaseUrl &&
      draft.apiKey === initialSettings.apiKey &&
      draft.apiKeyPreview === initialSettings.apiKeyPreview;
    if (draftMatchesSaved) setDraftModels(models);
  }, [draft, initialSettings, models]);

  const refreshModels = async () => {
    const availableModels = await onRefreshModels(draft);
    setDraftModels(availableModels);
    if (availableModels.length > 0 && !availableModels.includes(draft.model)) {
      setDraft((current) => ({
        ...current,
        model: availableModels[0],
      }));
    }
  };

  const selectProvider = async (provider: Provider) => {
    setIsSwitchingProvider(true);
    setSaveStatus(undefined);
    try {
      setDraft(await onLoadProvider(provider));
      setDraftModels([]);
    } catch (error) {
      setSaveStatus(`Could not load provider settings: ${String(error)}`);
    } finally {
      setIsSwitchingProvider(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setSaveStatus(undefined);
    try {
      await onSave(draft);
      setSaveStatus("Settings saved.");
    } catch (error) {
      setSaveStatus(`Could not save settings: ${String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="settings-page">
      <header className="settings-header">
        <div>
          <p className="eyebrow">KQode workspace</p>
          <h1>Settings</h1>
        </div>
      </header>

      <div className="settings-scroll">
        <form className="settings-card" onSubmit={submit}>
          <div className="settings-intro">
            <h2>Model provider</h2>
            <p>
              Configure provider credentials and highlighted models.
              Credentials are stored locally by the Rust backend.
            </p>
          </div>

          <div className="settings-field">
            <span>Provider</span>
            <ProviderPicker
              disabled={isLoading || isSwitchingProvider}
              onChange={(provider) => void selectProvider(provider)}
              settings={draft}
            />
          </div>

          {draft.provider === "custom" && (
            <CustomProviderUrlField
              disabled={isLoading}
              onChange={(apiBaseUrl) => {
                setDraft((current) => ({ ...current, apiBaseUrl }));
                setDraftModels([]);
              }}
              value={draft.apiBaseUrl}
            />
          )}

          {!usesKeylessCopilot && (
            <ApiKeySettingsField
              apiKey={draft.apiKey}
              apiKeyPreview={draft.apiKeyPreview}
              disabled={isLoading}
              onChange={(apiKey) => {
                setDraft((current) => ({
                  ...current,
                  apiKey,
                  apiKeyPreview: "",
                }));
                setDraftModels([]);
              }}
              provider={draft.provider}
            />
          )}

          <ModelSettingsField
            apiBaseUrl={draft.apiBaseUrl}
            disabled={isLoading}
            hasApiKey={Boolean(
              draft.apiKey.trim() || draft.apiKeyPreview,
            )}
            highlightedModels={draft.highlightedModels}
            model={draft.model}
            models={draftModels}
            modelsLoading={modelsLoading}
            provider={draft.provider}
            requiresApiKey={!usesKeylessCopilot}
            onAddHighlight={(model) =>
              setDraft((current) => ({
                ...current,
                highlightedModels: addHighlightedModel(
                  current.highlightedModels,
                  model,
                ),
                model,
              }))
            }
            onChange={(model) =>
              setDraft((current) => ({ ...current, model }))
            }
            onRefresh={() => void refreshModels()}
            onRemoveHighlight={(model) =>
              setDraft((current) => ({
                ...current,
                highlightedModels: current.highlightedModels.filter(
                  (highlightedModel) => highlightedModel !== model,
                ),
              }))
            }
          />

          {loadError && <p className="settings-error">{loadError}</p>}
          {modelsError && <p className="settings-error">{modelsError}</p>}
          {saveStatus && <p className="settings-status">{saveStatus}</p>}

          <div className="settings-actions">
            <button
              className="save-settings-button"
              disabled={
                isLoading ||
                isSaving ||
                (!usesKeylessCopilot &&
                  (!draft.model.trim() || !draft.apiBaseUrl.trim()))
              }
              type="submit"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
