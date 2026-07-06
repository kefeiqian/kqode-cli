import { Box, Text } from 'ink';
import { LoginStep } from '@state/ui/login/index.ts';
import type { LoginStep as LoginStepValue } from '@state/ui/login/index.ts';
import { theme } from '@theme/themeConfig.ts';

const CARET = '▌';

/** Custom endpoint URL/label form plus destination preview. */
export function CustomForm({
  baseUrl,
  baseUrlError,
  label,
  labelError,
  step
}: {
  baseUrl: string;
  baseUrlError: string | null;
  label: string;
  labelError: string | null;
  step: LoginStepValue;
}) {
  return (
    <Box flexDirection="column">
      <FieldRow
        active={step === LoginStep.CustomUrl}
        label="Base URL"
        placeholder="https://api.example.com/v1"
        value={baseUrl}
      />
      <InlineError message={baseUrlError} />
      <Text color={theme.colors.muted}>Destination host: {destinationHost(baseUrl)}</Text>
      <FieldRow
        active={step === LoginStep.CustomLabel}
        label="Label"
        placeholder="optional"
        value={label}
      />
      <InlineError message={labelError} />
      <Text color={theme.colors.muted}>Enter advances · ↑/Shift+Tab back · Esc back</Text>
    </Box>
  );
}

function FieldRow({
  active,
  label,
  placeholder,
  value
}: {
  active: boolean;
  label: string;
  placeholder: string;
  value: string;
}) {
  const rendered = value.length > 0 ? value : placeholder;
  return (
    <Text color={active ? theme.colors.accentBlue : theme.colors.foreground} wrap="truncate">
      {active ? '›' : ' '} {label}: {active ? `${rendered}${CARET}` : rendered}
    </Text>
  );
}

function InlineError({ message }: { message: string | null }) {
  if (message === null) {
    return null;
  }
  return <Text color={theme.colors.errorRed}>  {message}</Text>;
}

function destinationHost(input: string): string {
  try {
    const parsed = new URL(input.trim());
    return parsed.host || 'enter a base URL';
  } catch {
    return input.trim().length === 0 ? 'enter a base URL' : 'unresolved';
  }
}
