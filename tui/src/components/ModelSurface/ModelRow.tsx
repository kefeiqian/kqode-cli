import { Text } from 'ink';
import {
  MODEL_LIST_STATUS_EMPTY,
  MODEL_LIST_STATUS_FAILED
} from '@contracts/backend/providerMessages.ts';
import type { ModelHighlightIdentity, ModelSurfaceRow } from '@state/ui/model/index.ts';
import {
  MODEL_LOAD_STATUS_LOADING,
  MODEL_LOAD_STATUS_NOT_CONNECTED
} from '@state/ui/model/index.ts';
import { theme } from '@theme/themeConfig.ts';

const SELECTED_MARKER = '›';
const PLAIN_MARKER = ' ';
const ACTIVE_MARKER = '●';
const INACTIVE_MARKER = ' ';

/** Renders one flattened provider, model, or provider-status row. */
export function ModelRow({
  columns,
  highlight,
  row
}: {
  columns: number;
  highlight: ModelHighlightIdentity | null;
  row: ModelSurfaceRow;
}) {
  if (row.type === 'provider') {
    return <Text color={theme.colors.accentBlue}>{truncate(row.label, columns)}</Text>;
  }

  if (row.type === 'status' && row.status === MODEL_LOAD_STATUS_NOT_CONNECTED) {
    return (
      <Text color={theme.colors.muted} wrap="truncate">
        {truncate(statusLine(row, PLAIN_MARKER), columns)}
      </Text>
    );
  }

  const selected = isHighlighted(row, highlight);
  const marker = selected ? SELECTED_MARKER : PLAIN_MARKER;
  const color = selected ? theme.colors.accentBlue : theme.colors.foreground;
  const line = row.type === 'model' ? modelLine(row, marker) : statusLine(row, marker);

  return (
    <Text color={color} wrap="truncate">
      {truncate(line, columns)}
    </Text>
  );
}

function modelLine(row: Extract<ModelSurfaceRow, { type: 'model' }>, marker: string) {
  const active = row.model.isActive ? ACTIVE_MARKER : INACTIVE_MARKER;
  const owner = row.model.ownedBy === null ? '' : `  ${row.model.ownedBy}`;
  return `${marker}  ${active} ${row.model.id}${owner}`;
}

function statusLine(row: Extract<ModelSurfaceRow, { type: 'status' }>, marker: string) {
  if (row.status === MODEL_LOAD_STATUS_LOADING) {
    return `${marker}    loading…`;
  }
  if (row.status === MODEL_LIST_STATUS_FAILED) {
    return `${marker}    failed to load ↻`;
  }
  if (row.status === MODEL_LIST_STATUS_EMPTY) {
    return `${marker}    (no models)`;
  }
  if (row.status === MODEL_LOAD_STATUS_NOT_CONNECTED) {
    return `${marker}    (not connected — /login to add)`;
  }
  return `${marker}    ${row.status}`;
}

function isHighlighted(row: ModelSurfaceRow, highlight: ModelHighlightIdentity | null) {
  if (highlight === null || row.type === 'provider') {
    return false;
  }
  const modelId = row.type === 'model' ? row.modelId : null;
  return highlight.providerId === row.providerId && highlight.modelId === modelId;
}

function truncate(text: string, columns: number) {
  return text.slice(0, Math.max(0, columns));
}
