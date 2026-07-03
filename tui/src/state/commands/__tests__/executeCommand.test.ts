import { describe, expect, it, vi } from 'vitest';
import { executeCommand } from '@state/commands/executeCommand.ts';
import { CommandId } from '@state/commands/registry.ts';

const makeActions = () => ({
  exit: vi.fn(),
  clearTranscript: vi.fn(),
  showHelp: vi.fn()
});

describe('executeCommand', () => {
  it('runs exit only for the exit command', () => {
    const actions = makeActions();
    executeCommand(CommandId.Exit, actions);

    expect(actions.exit).toHaveBeenCalledTimes(1);
    expect(actions.clearTranscript).not.toHaveBeenCalled();
    expect(actions.showHelp).not.toHaveBeenCalled();
  });

  it('runs clearTranscript only for the clear command', () => {
    const actions = makeActions();
    executeCommand(CommandId.Clear, actions);

    expect(actions.clearTranscript).toHaveBeenCalledTimes(1);
    expect(actions.exit).not.toHaveBeenCalled();
    expect(actions.showHelp).not.toHaveBeenCalled();
  });

  it('runs showHelp only for the help command', () => {
    const actions = makeActions();
    executeCommand(CommandId.Help, actions);

    expect(actions.showHelp).toHaveBeenCalledTimes(1);
    expect(actions.exit).not.toHaveBeenCalled();
    expect(actions.clearTranscript).not.toHaveBeenCalled();
  });
});
