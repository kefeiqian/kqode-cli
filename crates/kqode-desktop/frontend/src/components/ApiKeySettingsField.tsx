import { useEffect, useState } from "react";
import type { Provider } from "../types";

type ApiKeySettingsFieldProps = {
  apiKey: string;
  apiKeyPreview: string;
  disabled: boolean;
  provider: Provider;
  onChange: (apiKey: string) => void;
};

export function ApiKeySettingsField({
  apiKey,
  apiKeyPreview,
  disabled,
  provider,
  onChange,
}: ApiKeySettingsFieldProps) {
  const [isReplacing, setIsReplacing] = useState(false);

  useEffect(() => {
    setIsReplacing(false);
  }, [apiKeyPreview]);

  const showsSavedKey = Boolean(apiKeyPreview && !isReplacing);
  const providerName = provider === "custom" ? "provider" : provider;

  return (
    <label className="settings-field">
      <span>API key</span>
      <div className="settings-api-key-input">
        <input
          autoComplete="off"
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder={`Enter your ${providerName} API key`}
          readOnly={showsSavedKey}
          type={showsSavedKey ? "text" : "password"}
          value={showsSavedKey ? apiKeyPreview : apiKey}
        />
        {showsSavedKey && (
          <button
            disabled={disabled}
            onClick={() => setIsReplacing(true)}
            type="button"
          >
            Replace
          </button>
        )}
      </div>
      <small className="settings-help">
        {showsSavedKey
          ? "The saved key is redacted. Choose Replace to enter a new key."
          : "Your key is stored locally and is required to fetch the models available to your account."}
      </small>
    </label>
  );
}
