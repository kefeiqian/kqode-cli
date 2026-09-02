import { Box, Text } from 'ink';
import { useAtomValue } from 'jotai';
import {
  MemoryFormField,
  type MemoryFormState
} from '@state/ui/memory/index.ts';
import { activeThemeAtom } from '@state/global/index.ts';

const CARET = '▌';

export function MemoryForm({ columns, form }: { columns: number; form: MemoryFormState }) {
  const theme = useAtomValue(activeThemeAtom);
  const title = renderValue(form.title, 'short title', form.titleCursor, form.activeField === MemoryFormField.Title);
  const body = renderValue(form.body, 'memory body', form.bodyCursor, form.activeField === MemoryFormField.Body);
  const heading = form.mode === 'add' ? 'Add project memory' : 'Edit project memory';

  return (
    <Box flexDirection="column" width={columns}>
      <Text color={theme.colors.accentBlue}>{heading.slice(0, columns)}</Text>
      <FieldRow active={form.activeField === MemoryFormField.Title} label="Title" value={title} columns={columns} />
      <InlineError message={form.titleError} />
      <FieldRow active={form.activeField === MemoryFormField.Body} label="Body" value={body} columns={columns} />
      <InlineError message={form.submitError} />
      <Text color={theme.colors.muted}>
        {'tab field · shift+enter newline · enter save · esc cancel'.slice(0, columns)}
      </Text>
    </Box>
  );
}

function FieldRow({
  active,
  label,
  value,
  columns
}: {
  active: boolean;
  label: string;
  value: string;
  columns: number;
}) {
  const theme = useAtomValue(activeThemeAtom);
  const lines = value.split('\n');
  const prefix = `  ${label}: `;
  return (
    <Box flexDirection="column" width={columns}>
      {lines.map((line, index) => (
        <Text key={index} color={active ? theme.colors.accentBlue : theme.colors.foreground}>
          {`${index === 0 ? prefix : ' '.repeat(prefix.length)}${line}`.slice(0, columns)}
        </Text>
      ))}
    </Box>
  );
}

function InlineError({ message }: { message: string | null }) {
  const theme = useAtomValue(activeThemeAtom);
  if (message === null) {
    return null;
  }
  return <Text color={theme.colors.errorRed}>{`  ${message}`}</Text>;
}

function renderValue(value: string, placeholder: string, cursor: number, active: boolean): string {
  if (!active) {
    return value.length === 0 ? placeholder : value;
  }
  const rendered = value.length === 0 ? placeholder : value;
  const insertion = value.length === 0 ? rendered.length : cursor;
  return `${rendered.slice(0, insertion)}${CARET}${rendered.slice(insertion)}`;
}
