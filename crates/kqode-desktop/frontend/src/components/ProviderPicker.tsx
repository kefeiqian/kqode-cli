import type { LlmSettings, Provider } from "../types";
import { PROVIDERS } from "../providers";
import { ProviderLogo } from "./ProviderLogo";

type ProviderPickerProps = {
  disabled: boolean;
  settings: LlmSettings;
  onChange: (provider: Provider) => void;
};

export function ProviderPicker({
  disabled,
  settings,
  onChange,
}: ProviderPickerProps) {
  const selectProvider = (provider: Provider) => {
    if (provider === settings.provider) return;
    onChange(provider);
  };

  return (
    <div className="provider-list">
      {PROVIDERS.map((provider) => (
        <button
          className={`provider-option ${
            provider.id === settings.provider ? "selected" : ""
          }`}
          disabled={disabled}
          key={provider.id}
          onClick={() => selectProvider(provider.id)}
          type="button"
        >
          <ProviderLogo
            apiBaseUrl={
              provider.id === settings.provider
                ? settings.apiBaseUrl
                : undefined
            }
            provider={provider.id}
          />
          <span>
            <strong>
              {provider.id === "custom" && <span aria-hidden>+ </span>}
              {provider.name}
            </strong>
            <small>{provider.detail}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
