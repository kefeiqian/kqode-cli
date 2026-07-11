import { describe, expect, it } from 'vitest';
import { RESUME_ARG_NAME } from '@constants/cli.ts';
import { CLI_NAME } from '@constants/product.ts';
import { buildResumeCommand } from '@libs/resume/resumeCommand.ts';

describe('buildResumeCommand', () => {
  it('builds the command from CLI_NAME and the resume arg name, not literals', () => {
    expect(buildResumeCommand('conv-123')).toBe(`${CLI_NAME} --${RESUME_ARG_NAME}=conv-123`);
  });

  it('renders the kqode --resume=<id> shape', () => {
    expect(buildResumeCommand('conv-123')).toBe('kqode --resume=conv-123');
  });

  it('passes a full hyphenated/hex session id through unchanged (not truncated)', () => {
    const sessionId = 'conv-1783754959900-1a2b-7';
    expect(buildResumeCommand(sessionId)).toBe(`kqode --resume=${sessionId}`);
    expect(buildResumeCommand(sessionId)).toContain(sessionId);
  });
});
