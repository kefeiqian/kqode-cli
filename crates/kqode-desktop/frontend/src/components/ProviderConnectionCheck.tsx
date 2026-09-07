import { useState } from "react";
import type {
  LlmSettings,
  ProviderConnectionStatus,
} from "../types";

type ProviderConnectionCheckProps = {
  disabled: boolean;
  onModels: (models: string[]) => void;
  onTest: (settings: LlmSettings) => Promise<ProviderConnectionStatus>;
  settings: LlmSettings;
};

export function ProviderConnectionCheck({
  disabled,
  onModels,
  onTest,
  settings,
}: ProviderConnectionCheckProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [result, setResult] = useState<{
    kind: "error" | "success";
    message: string;
  }>();

  const testConnection = async () => {
    setIsTesting(true);
    setResult(undefined);
    try {
      const status = await onTest(settings);
      onModels(status.models);
      const providerName =
        status.provider === "copilot" ? "Copilot CLI" : "Copilot SDK";
      const capability =
        status.provider === "copilot"
          ? "is available"
          : "runtime is available and authenticated";
      setResult({
        kind: "success",
        message: `${providerName} ${capability}. ${status.models.length} models found.`,
      });
    } catch (error) {
      setResult({
        kind: "error",
        message: `Connection check failed: ${String(error)}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="settings-field">
      <span>Connection</span>
      <button
        className="test-provider-button"
        disabled={disabled || isTesting}
        onClick={() => void testConnection()}
        type="button"
      >
        {isTesting ? "Checking..." : "Test connection"}
      </button>
      {result && (
        <small
          className={
            result.kind === "success"
              ? "provider-test-success"
              : "provider-test-error"
          }
        >
          {result.message}
        </small>
      )}
    </div>
  );
}
