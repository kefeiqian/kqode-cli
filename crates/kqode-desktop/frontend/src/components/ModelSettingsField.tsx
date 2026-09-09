import { useEffect, useRef, useState } from "react";
import type { Provider } from "../types";

type ModelSettingsFieldProps = {
  apiBaseUrl: string;
  disabled: boolean;
  hasApiKey: boolean;
  highlightedModels: string[];
  model: string;
  models: string[];
  modelsLoading: boolean;
  provider: Provider;
  refreshDisabled: boolean;
  requiresApiKey: boolean;
  onAddHighlight: (model: string) => void;
  onChange: (model: string) => void;
  onRefresh: () => void;
  onRemoveHighlight: (model: string) => void;
};

export function ModelSettingsField({
  apiBaseUrl,
  disabled,
  hasApiKey,
  highlightedModels,
  model,
  models,
  modelsLoading,
  provider,
  refreshDisabled,
  requiresApiKey,
  onAddHighlight,
  onChange,
  onRefresh,
  onRemoveHighlight,
}: ModelSettingsFieldProps) {
  const canFetchModels =
    !requiresApiKey || Boolean(hasApiKey && apiBaseUrl.trim());
  const normalizedModel = model.trim();
  const modelIsHighlighted = highlightedModels.includes(normalizedModel);
  const [isOpen, setIsOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const closeMenu = (event: MouseEvent) => {
      if (!selectorRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <div className="settings-field">
      <div className="settings-field-header">
        <label htmlFor="settings-model">Model</label>
        <button
          className="refresh-models-button"
          disabled={
            disabled || refreshDisabled || modelsLoading || !canFetchModels
          }
          onClick={onRefresh}
          type="button"
        >
          {modelsLoading ? "Fetching..." : "Fetch models"}
        </button>
      </div>
      <small className={`settings-help ${canFetchModels ? "" : "attention"}`}>
        {refreshDisabled
          ? "Save provider connection changes before fetching models."
          : !requiresApiKey
          ? provider === "copilot"
            ? "Models are read from the installed GitHub Copilot CLI. Highlight at least one model so conversations can select it explicitly."
            : "Models are read through the GitHub Copilot SDK. Highlight at least one model so conversations can select it explicitly."
          : canFetchModels
          ? "Select or enter a model, then use + to add it to the chat model menu."
          : "Enter an API key to fetch models, or enter a model ID manually and use + to highlight it."}
      </small>
      <div className="settings-model-selector" ref={selectorRef}>
        <div className="settings-model-picker">
          <input
            aria-controls="settings-model-options"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            id="settings-model"
            disabled={disabled || modelsLoading}
            onChange={(event) => onChange(event.currentTarget.value)}
            placeholder="Model ID"
            type="text"
            value={model}
          />
          <button
            aria-label={
              modelIsHighlighted
                ? `${normalizedModel} is already highlighted`
                : `Add ${normalizedModel || "model"} to highlighted models`
            }
            className="settings-model-add"
            disabled={
              disabled ||
              modelsLoading ||
              !normalizedModel ||
              modelIsHighlighted
            }
            onClick={() => onAddHighlight(normalizedModel)}
            title={
              modelIsHighlighted
                ? "Already in chat model menu"
                : "Add to chat model menu"
            }
            type="button"
          >
            <span aria-hidden>+</span>
          </button>
          <button
            aria-label="Show all available models"
            className="settings-model-toggle"
            disabled={disabled || modelsLoading || models.length === 0}
            onClick={() => setIsOpen((current) => !current)}
            type="button"
          >
            <span aria-hidden>▾</span>
          </button>
          {isOpen && (
            <div
              className="settings-model-menu"
              id="settings-model-options"
              role="listbox"
            >
              {models.map((availableModel) => (
                <button
                  aria-selected={availableModel === model}
                  className={
                    availableModel === model ? "selected" : undefined
                  }
                  key={availableModel}
                  onClick={() => {
                    onChange(availableModel);
                    setIsOpen(false);
                  }}
                  role="option"
                  type="button"
                >
                  {availableModel}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="settings-highlighted-models">
          <div className="settings-highlighted-models-header">
            <span>Highlighted models</span>
          </div>
          {highlightedModels.length > 0 ? (
            <div className="settings-highlighted-model-list">
              {highlightedModels.map((highlightedModel) => (
                <button
                  aria-label={`Remove ${highlightedModel} from highlighted models`}
                  disabled={disabled}
                  key={highlightedModel}
                  onClick={() => onRemoveHighlight(highlightedModel)}
                  title="Remove from chat model menu"
                  type="button"
                >
                  <span>{highlightedModel}</span>
                  <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          ) : (
            <small>
              No highlighted models. Add one to show it in the chat model menu.
            </small>
          )}
        </div>
      </div>
    </div>
  );
}
