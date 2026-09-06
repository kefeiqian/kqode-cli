import { useEffect, useRef, useState } from "react";

type ModelSelectorProps = {
  disabled: boolean;
  hasApiKey: boolean;
  model: string;
  models: string[];
  modelsError?: string;
  modelsLoading: boolean;
  onChange: (model: string) => Promise<void>;
  onConfigureApiKey: () => void;
  providerSelected: boolean;
};

export function ModelSelector({
  disabled,
  hasApiKey,
  model,
  models,
  modelsError,
  modelsLoading,
  onChange,
  onConfigureApiKey,
  providerSelected,
}: ModelSelectorProps) {
  const [error, setError] = useState<string>();
  const [isOpen, setIsOpen] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const visibleModel = models.includes(model) ? model : "";

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

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

  const selectModel = async (nextModel: string) => {
    setIsOpen(false);
    setError(undefined);
    try {
      await onChange(nextModel);
    } catch (saveError) {
      setError(`Could not save model: ${String(saveError)}`);
    }
  };

  if (!providerSelected) {
    return (
      <div className="composer-control">
        <button
          className="composer-model-trigger composer-chat-model-trigger"
          disabled
          type="button"
        >
          Select provider first
        </button>
      </div>
    );
  }

  if (models.length === 0 && !modelsLoading) {
    return (
      <div className="composer-control">
        <button
          className="composer-model-trigger composer-add-model-trigger"
          disabled={disabled}
          onClick={onConfigureApiKey}
          type="button"
        >
          + Add highlighted model
        </button>
      </div>
    );
  }

  return (
    <div className="composer-control">
      <div className="composer-model-selector" ref={selectorRef}>
        <button
          aria-label={visibleModel || "Select chat model"}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className="composer-model-trigger composer-chat-model-trigger"
          disabled={disabled}
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          {visibleModel && <span>{visibleModel}</span>}
          <span aria-hidden className="composer-model-chevron">
            ▾
          </span>
        </button>
        {isOpen && !disabled && (
          <div
            aria-label="Select chat model"
            className="composer-model-menu"
            role="listbox"
          >
            {!hasApiKey ? (
              <button
                className="composer-model-message"
                onClick={onConfigureApiKey}
                role="option"
                type="button"
              >
                Enter API key to load models
              </button>
            ) : modelsLoading ? (
              <div className="composer-model-message" role="status">
                Loading available models...
              </div>
            ) : modelsError ? (
              <button
                className="composer-model-message error"
                onClick={onConfigureApiKey}
                role="option"
                type="button"
              >
                {modelsError}
                <strong>Update API key</strong>
              </button>
            ) : (
              models.map((availableModel) => (
                <button
                  aria-selected={availableModel === model}
                  className={
                    availableModel === model ? "selected" : undefined
                  }
                  key={availableModel}
                  onClick={() => void selectModel(availableModel)}
                  role="option"
                  type="button"
                >
                  {availableModel}
                </button>
              ))
            )}
          </div>
        )}
      </div>
      {error && <span className="composer-model-error">{error}</span>}
    </div>
  );
}
