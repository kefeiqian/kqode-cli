import type { Provider } from "../types";
import { PROVIDERS } from "../providers";
import { ProviderLogo } from "./ProviderLogo";

type ProviderPickerProps = {
  apiBaseUrl?: string;
  disabled: boolean;
  onChange: (provider: Provider) => void;
  provider?: Provider;
};

export function ProviderPicker({
  apiBaseUrl,
  disabled,
  onChange,
  provider: selectedProvider,
}: ProviderPickerProps) {
  const selectProvider = (provider: Provider) => {
    if (provider === selectedProvider) return;
    onChange(provider);
  };

  return (
    <div className="provider-list">
      {PROVIDERS.map((provider) => (
        <button
          className={`provider-option ${
            provider.id === selectedProvider ? "selected" : ""
          }`}
          disabled={disabled}
          key={provider.id}
          onClick={() => selectProvider(provider.id)}
          type="button"
        >
          <ProviderLogo
            apiBaseUrl={
              provider.id === selectedProvider ? apiBaseUrl : undefined
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
