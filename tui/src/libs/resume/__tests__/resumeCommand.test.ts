import { describe, expect, it } from 'vitest';
import { RESUME_ARG_NAME } from '@constants/cli.ts';
import { CLI_NAME } from '@constants/product.ts';
import { buildResumeCommand } from '@libs/resume/resumeCommand.ts';

const SESSION_ID = '019f5a2b-15e0-7ef1-9ad2-10a132448b7';

describe('buildResumeCommand', () => {
  it('builds the command from CLI_NAME and the resume arg name, not literals', () => {
    expect(buildResumeCommand(SESSION_ID)).toBe(`${CLI_NAME} --${RESUME_ARG_NAME}=${SESSION_ID}`);
  });

  it('renders the kqode --resume=<id> shape', () => {
    expect(buildResumeCommand(SESSION_ID)).toBe(`kqode --resume=${SESSION_ID}`);
  });

  it('passes a full UUID session id through unchanged (not truncated)', () => {
    expect(buildResumeCommand(SESSION_ID)).toBe(`kqode --resume=${SESSION_ID}`);
    expect(buildResumeCommand(SESSION_ID)).toContain(SESSION_ID);
  });
});
