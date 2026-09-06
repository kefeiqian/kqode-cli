type CustomProviderUrlFieldProps = {
  disabled: boolean;
  value: string;
  onChange: (apiBaseUrl: string) => void;
};

export function CustomProviderUrlField({
  disabled,
  value,
  onChange,
}: CustomProviderUrlFieldProps) {
  return (
    <label className="settings-field">
      <span>API base URL</span>
      <input
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder="https://api.example.com/v1"
        type="url"
        value={value}
      />
      <small className="settings-help">
        The provider logo is loaded from this site's favicon.
      </small>
    </label>
  );
}
