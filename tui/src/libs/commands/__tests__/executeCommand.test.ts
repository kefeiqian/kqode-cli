import { describe, expect, it, vi } from 'vitest';
import {
  CommandMemoryMode,
  executeCommand,
  executeMenuSelection
} from '@libs/commands/executeCommand.ts';
import { CommandId } from '@libs/commands/registry.ts';
import { exactCommandMatch } from '@libs/commands/matchCommand.ts';

const makeActions = () => ({
  exit: vi.fn(),
  clearTranscript: vi.fn(),
  showHelp: vi.fn(),
  openConnect: vi.fn(),
  openModel: vi.fn(),
  openResume: vi.fn(),
  openMemory: vi.fn(),
  openMemoryAdd: vi.fn(),
  openMemoryEdit: vi.fn(),
  openMemoryForget: vi.fn(),
  openTheme: vi.fn()
});

describe('executeMenuSelection', () => {
  it('runs a selected top-level command', () => {
    const actions = makeActions();
    executeMenuSelection(exactCommandMatch('/clear')!, actions);

    expect(actions.clearTranscript).toHaveBeenCalledTimes(1);
  });

  it('opens memory active for show and memory inbox for inbox', () => {
    const actions = makeActions();
    executeMenuSelection(exactCommandMatch('/memory show')!, actions);
    executeMenuSelection(exactCommandMatch('/memory inbox')!, actions);

    expect(actions.openMemory).toHaveBeenNthCalledWith(1, CommandMemoryMode.Active);
    expect(actions.openMemory).toHaveBeenNthCalledWith(2, CommandMemoryMode.Inbox);
  });

  it('opens the add flow for memory add', () => {
    const actions = makeActions();
    executeMenuSelection(exactCommandMatch('/memory add')!, actions);

    expect(actions.openMemoryAdd).toHaveBeenCalledTimes(1);
    expect(actions.openMemory).not.toHaveBeenCalled();
  });

  it('opens the edit flow for memory edit', () => {
    const actions = makeActions();
    executeMenuSelection(exactCommandMatch('/memory edit')!, actions);

    expect(actions.openMemoryEdit).toHaveBeenCalledTimes(1);
  });

  it('opens the forget flow for memory forget', () => {
    const actions = makeActions();
    executeMenuSelection(exactCommandMatch('/memory forget')!, actions);

    expect(actions.openMemoryForget).toHaveBeenCalledTimes(1);
  });
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

  it('runs openConnect only for the Connect command', () => {
    const actions = makeActions();
    executeCommand(CommandId.Connect, actions);

    expect(actions.openConnect).toHaveBeenCalledTimes(1);
    expect(actions.openModel).not.toHaveBeenCalled();
    expect(actions.exit).not.toHaveBeenCalled();
    expect(actions.clearTranscript).not.toHaveBeenCalled();
    expect(actions.showHelp).not.toHaveBeenCalled();
  });

  it('runs openModel only for the model command without awaiting command lookup', () => {
    const actions = makeActions();
    executeCommand(CommandId.Model, actions);

    expect(actions.openModel).toHaveBeenCalledTimes(1);
    expect(actions.openConnect).not.toHaveBeenCalled();
    expect(actions.exit).not.toHaveBeenCalled();
    expect(actions.clearTranscript).not.toHaveBeenCalled();
    expect(actions.showHelp).not.toHaveBeenCalled();
  });

  it('runs openResume only for the resume command without awaiting command lookup', () => {
    const actions = makeActions();
    executeCommand(CommandId.Resume, actions);

    expect(actions.openResume).toHaveBeenCalledTimes(1);
    expect(actions.openModel).not.toHaveBeenCalled();
    expect(actions.openConnect).not.toHaveBeenCalled();
    expect(actions.exit).not.toHaveBeenCalled();
    expect(actions.clearTranscript).not.toHaveBeenCalled();
    expect(actions.showHelp).not.toHaveBeenCalled();
  });

  it('runs openMemory only for the memory command without awaiting command lookup', () => {
    const actions = makeActions();
    executeCommand(CommandId.Memory, actions);

    expect(actions.openMemory).toHaveBeenCalledWith(CommandMemoryMode.Active);
    expect(actions.openResume).not.toHaveBeenCalled();
    expect(actions.openModel).not.toHaveBeenCalled();
    expect(actions.openConnect).not.toHaveBeenCalled();
    expect(actions.exit).not.toHaveBeenCalled();
  });

  it('runs openTheme only for the theme command', () => {
    const actions = makeActions();
    executeCommand(CommandId.Theme, actions);

    expect(actions.openTheme).toHaveBeenCalledTimes(1);
    expect(actions.openMemory).not.toHaveBeenCalled();
    expect(actions.openModel).not.toHaveBeenCalled();
    expect(actions.exit).not.toHaveBeenCalled();
  });
});
