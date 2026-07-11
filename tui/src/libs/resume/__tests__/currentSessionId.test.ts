import { describe, expect, it } from 'vitest';
import type { SessionSummary } from '@contracts/backend/index.ts';
import { SESSION_STATUS_CURRENT, SESSION_STATUS_IDLE } from '@contracts/backend/index.ts';
import { selectCurrentSessionId } from '@libs/resume/currentSessionId.ts';

function session(overrides: Partial<SessionSummary>): SessionSummary {
  return {
    sessionId: 'sess',
    summary: 's',
    status: SESSION_STATUS_IDLE,
    modifiedAt: 0,
    createdAt: 0,
    folder: 'f',
    ...overrides
  };
}

describe('selectCurrentSessionId', () => {
  it('returns the id of the Current row', () => {
    const sessions = [
      session({ sessionId: 'a', status: SESSION_STATUS_IDLE }),
      session({ sessionId: 'b', status: SESSION_STATUS_CURRENT })
    ];
    expect(selectCurrentSessionId(sessions)).toBe('b');
  });

  it('returns undefined when no row is Current', () => {
    const sessions = [
      session({ sessionId: 'a', status: SESSION_STATUS_IDLE }),
      session({ sessionId: 'b', status: SESSION_STATUS_IDLE })
    ];
    expect(selectCurrentSessionId(sessions)).toBeUndefined();
  });

  it('returns undefined for an empty list', () => {
    expect(selectCurrentSessionId([])).toBeUndefined();
  });
});
