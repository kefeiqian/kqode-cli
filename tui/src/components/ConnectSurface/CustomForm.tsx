import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import {
  ConnectStep,
  customBaseUrlCursorAtom,
  customLabelCursorAtom
} from '@state/ui/connect/index.ts';
import type { ConnectStep as ConnectStepValue } from '@state/ui/connect/index.ts';
import { activeThemeAtom } from '@state/global/index.ts';

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
  step: ConnectStepValue;
}) {
  const theme = useAtomValue(activeThemeAtom);
  const baseUrlCursor = useAtomValue(customBaseUrlCursorAtom);
  const labelCursor = useAtomValue(customLabelCursorAtom);

  return (
    <Box flexDirection="column">
      <FieldRow
        active={step === ConnectStep.CustomUrl}
        cursorIndex={baseUrlCursor}
        label="Base URL"
        placeholder="https://api.example.com/v1"
        value={baseUrl}
      />
      <InlineError message={baseUrlError} />
      <Text color={theme.colors.muted}>Destination host: {destinationHost(baseUrl)}</Text>
      <FieldRow
        active={step === ConnectStep.CustomLabel}
        cursorIndex={labelCursor}
        label="Label"
        placeholder="optional"
        value={label}
      />
      <InlineError message={labelError} />
    </Box>
  );
}

function FieldRow({
  active,
  cursorIndex,
  label,
  placeholder,
  value
}: {
  active: boolean;
  cursorIndex: number;
  label: string;
  placeholder: string;
  value: string;
}) {
  const theme = useAtomValue(activeThemeAtom);
  const lineColor = active ? theme.colors.accentBlue : theme.colors.foreground;
  const prefix = active ? '❯' : ' ';

  if (value.length === 0) {
    return (
      <Text color={lineColor} wrap="truncate">
        {prefix} {label}: <Text color={theme.colors.muted}>{active ? `${CARET} ${placeholder}` : placeholder}</Text>
      </Text>
    );
  }

  if (!active) {
    return (
      <Text color={lineColor} wrap="truncate">
        {prefix} {label}: {value}
      </Text>
    );
  }

  const clamped = Math.max(0, Math.min(value.length, cursorIndex));
  return (
    <Text color={lineColor} wrap="truncate">
      {prefix} {label}: {value.slice(0, clamped)}
      {CARET}
      {value.slice(clamped)}
    </Text>
  );
}

function InlineError({ message }: { message: string | null }) {
  const theme = useAtomValue(activeThemeAtom);

  if (message === null) {
    return null;
  }
  return <Text color={theme.colors.errorRed}>  {message}</Text>;
}

export function destinationHost(input: string): string {
  try {
    const parsed = new URL(input.trim());
    return parsed.host || 'enter a base URL';
  } catch {
    return input.trim().length === 0 ? 'enter a base URL' : 'unresolved';
  }
}
