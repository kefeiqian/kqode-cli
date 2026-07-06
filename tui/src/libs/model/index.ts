const MODEL_LABEL_SEPARATOR = ' · ';

/** Status-bar label shown before a usable backend model is configured. */
export const NOT_CONFIGURED_MODEL_LABEL = 'not configured';

/** Status-bar label shown when the global model is unavailable in this workspace. */
export const NOT_CONFIGURED_HERE_MODEL_LABEL = 'not configured here';

/** Initial model label for first paint before backend state resolves. */
export const DEFAULT_MODEL_LABEL = NOT_CONFIGURED_MODEL_LABEL;

/** Formats the compact provider/model label rendered by the status bar. */
export function formatModelLabel(providerLabel: string, modelId: string): string {
  const provider = providerLabel.trim();
  const model = modelId.trim();
  if (provider.length === 0) {
    return model;
  }
  if (model.length === 0) {
    return provider;
  }
  return `${provider}${MODEL_LABEL_SEPARATOR}${model}`;
}
