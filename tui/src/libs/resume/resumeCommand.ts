import { RESUME_ARG_NAME } from '@constants/cli.ts';
import { CLI_NAME } from '@constants/product.ts';

/**
 * Builds the shell command that reopens `sessionId`, e.g. `kqode --resume=conv-…`.
 *
 * The full `sessionId` is preserved so the printed command can be pasted and run
 * as-is. `CLI_NAME` and {@link RESUME_ARG_NAME} are used instead of literals so
 * the command stays in lockstep with how the binary is invoked and how the CLI
 * argument is named.
 */
export function buildResumeCommand(sessionId: string): string {
  return `${CLI_NAME} --${RESUME_ARG_NAME}=${sessionId}`;
}
