/**
 * Name of the `--resume=<id>` CLI argument that reopens a durable session by id.
 *
 * Shared by the citty command definition (`createKqodeCommand` in
 * `cli/kqodeCli.tsx`) and the exit-card command builder (`buildResumeCommand`
 * in `libs/resume/resumeCommand.ts`) so the flag the card prints always matches
 * the flag the CLI actually accepts.
 */
export const RESUME_ARG_NAME = 'resume';
