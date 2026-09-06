import { useEffect, useRef, useState } from "react";
import { PROVIDERS } from "../providers";
import type { Provider } from "../types";
import { ProviderLogo } from "./ProviderLogo";

type ProviderSelectorProps = {
  apiBaseUrl: string;
  disabled: boolean;
  onChange: (provider?: Provider) => Promise<void>;
  provider?: Provider;
};

export function ProviderSelector({
  apiBaseUrl,
  disabled,
  onChange,
  provider,
}: ProviderSelectorProps) {
  const [error, setError] = useState<string>();
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const selectorRef = useRef<HTMLDivElement>(null);
  const selectedProvider = PROVIDERS.find((option) => option.id === provider);

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

  const selectProvider = async (nextProvider?: Provider) => {
    setIsOpen(false);
    if (nextProvider === provider) return;

    setError(undefined);
    setIsSwitching(true);
    try {
      await onChange(nextProvider);
    } catch (switchError) {
      setError(`Could not switch provider: ${String(switchError)}`);
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div className="composer-control">
      <div className="composer-model-selector" ref={selectorRef}>
        <button
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          className="composer-model-trigger"
          disabled={disabled || isSwitching}
          onClick={() => setIsOpen((current) => !current)}
          type="button"
        >
          {provider ? (
            <ProviderLogo
              apiBaseUrl={apiBaseUrl}
              provider={provider}
              size={20}
            />
          ) : (
            <span aria-hidden className="provider-none-icon">
              —
            </span>
          )}
          <span>{selectedProvider?.name ?? "Select provider"}</span>
          <span aria-hidden className="composer-model-chevron">
            ▾
          </span>
        </button>
        {isOpen && (
          <div
            aria-label="Select model provider"
            className="composer-model-menu composer-provider-menu"
            role="listbox"
          >
            <button
              aria-selected={!provider}
              className={!provider ? "selected" : undefined}
              onClick={() => void selectProvider(undefined)}
              role="option"
              type="button"
            >
              <span aria-hidden className="provider-none-icon">
                —
              </span>
              <span>
                <strong>None</strong>
                <small>No provider selected</small>
              </span>
            </button>
            {PROVIDERS.map((option) => (
              <button
                aria-selected={option.id === provider}
                className={option.id === provider ? "selected" : undefined}
                key={option.id}
                onClick={() => void selectProvider(option.id)}
                role="option"
                type="button"
              >
                <ProviderLogo
                  apiBaseUrl={option.id === provider ? apiBaseUrl : undefined}
                  provider={option.id}
                  size={20}
                />
                <span>
                  <strong>{option.name}</strong>
                  <small>{option.detail}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <span className="composer-model-error">{error}</span>}
    </div>
  );
}
