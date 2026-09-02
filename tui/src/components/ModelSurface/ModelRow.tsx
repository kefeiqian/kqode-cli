import { Text } from 'ink';
import { useAtomValue } from 'jotai';
import { SelectableRow } from '@components/SelectableRow/index.tsx';
import {
  MODEL_LIST_STATUS_EMPTY,
  MODEL_LIST_STATUS_FAILED
} from '@contracts/backend/providerMessages.ts';
import type { ModelHighlightIdentity, ModelSurfaceRow } from '@state/ui/model/index.ts';
import {
  MODEL_LOAD_STATUS_LOADING,
  MODEL_LOAD_STATUS_NOT_CONNECTED
} from '@state/ui/model/index.ts';
import { activeThemeAtom } from '@state/global/index.ts';

const ACTIVE_MARKER = '●';
const INACTIVE_MARKER = ' ';

/**
 * Renders one flattened provider, model, or provider-status row. Provider
 * headers stay bespoke accent section labels; model and status rows route
 * through the shared `SelectableRow`. The active-model `●` lives inside the row
 * content (after the chevron gutter), so it survives the selection unification.
 */
export function ModelRow({
  highlight,
  row
}: {
  highlight: ModelHighlightIdentity | null;
  row: ModelSurfaceRow;
}) {
  const theme = useAtomValue(activeThemeAtom);

  if (row.type === 'provider') {
    return (
      <Text color={theme.colors.accentBlue} wrap="truncate">
        {row.label}
      </Text>
    );
  }

  const selected = isHighlighted(row, highlight);
  // Non-highlighted "not connected" rows read as muted; SelectableRow uses the
  // accent color for the highlighted row regardless.
  const color =
    row.type === 'status' && row.status === MODEL_LOAD_STATUS_NOT_CONNECTED
      ? theme.colors.muted
      : undefined;
  const content = row.type === 'model' ? modelContent(row) : statusContent(row);

  return <SelectableRow highlighted={selected} color={color} content={content} />;
}

function modelContent(row: Extract<ModelSurfaceRow, { type: 'model' }>) {
  const active = row.model.isActive ? ACTIVE_MARKER : INACTIVE_MARKER;
  const owner = row.model.ownedBy === null ? '' : `  ${row.model.ownedBy}`;
  return `${active} ${row.model.id}${owner}`;
}

function statusContent(row: Extract<ModelSurfaceRow, { type: 'status' }>) {
  // Two leading spaces align the status text under the model-id column (past the
  // active-marker slot).
  if (row.status === MODEL_LOAD_STATUS_LOADING) {
    return '  loading…';
  }
  if (row.status === MODEL_LIST_STATUS_FAILED) {
    return '  failed to load ↻';
  }
  if (row.status === MODEL_LIST_STATUS_EMPTY) {
    return '  (no models)';
  }
  if (row.status === MODEL_LOAD_STATUS_NOT_CONNECTED) {
    return '  (not connected — enter to connect)';
  }
  return `  ${row.status}`;
}

function isHighlighted(row: ModelSurfaceRow, highlight: ModelHighlightIdentity | null) {
  if (highlight === null || row.type === 'provider') {
    return false;
  }
  const modelId = row.type === 'model' ? row.modelId : null;
  return highlight.providerId === row.providerId && highlight.modelId === modelId;
}
