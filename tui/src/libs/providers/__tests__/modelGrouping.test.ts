import { describe, expect, it } from 'vitest';
import {
  flattenProviderModelRows,
  groupProviderModels,
  windowProviderModelRows
} from '@libs/providers/modelGrouping.ts';
import {
  CREDENTIAL_SOURCE_KEYCHAIN,
  MODEL_LIST_STATUS_LOADED,
  PROVIDER_STATUS_CONNECTED
} from '@contracts/backend/providerMessages.ts';
import type { ProviderModelsInput } from '@libs/providers/modelGrouping.ts';

const inputs: ProviderModelsInput[] = [
  {
    provider: {
      providerId: 'kimi',
      label: 'Kimi',
      baseUrl: 'https://api.moonshot.cn/v1',
      status: PROVIDER_STATUS_CONNECTED,
      credentialSource: CREDENTIAL_SOURCE_KEYCHAIN
    },
    modelList: {
      status: MODEL_LIST_STATUS_LOADED,
      models: [
        { id: 'kimi-k2', ownedBy: 'moonshot' },
        { id: 'kimi-vl', ownedBy: null }
      ]
    }
  },
  {
    provider: {
      providerId: 'custom',
      label: 'Custom',
      baseUrl: 'https://models.example/v1',
      status: PROVIDER_STATUS_CONNECTED,
      credentialSource: CREDENTIAL_SOURCE_KEYCHAIN
    },
    modelList: {
      status: MODEL_LIST_STATUS_LOADED,
      models: [{ id: 'gpt-5\u001B[31m', ownedBy: 'openai' }]
    }
  }
];

describe('model grouping', () => {
  it('groups per provider and marks the active model by provider/model identity', () => {
    const groups = groupProviderModels(inputs, { providerId: 'custom', modelId: 'gpt-5' });

    expect(groups).toHaveLength(2);
    expect(groups[0]?.models.map((model) => model.isActive)).toEqual([false, false]);
    expect(groups[1]?.models).toMatchObject([{ id: 'gpt-5', providerId: 'custom', isActive: true }]);
  });

  it('windows flattened provider/model rows', () => {
    const rows = flattenProviderModelRows(
      groupProviderModels(inputs, { providerId: 'kimi', modelId: 'kimi-vl' })
    );

    expect(windowProviderModelRows(rows, 1, 3).map((row) => row.type)).toEqual([
      'model',
      'model',
      'provider'
    ]);
  });
});
