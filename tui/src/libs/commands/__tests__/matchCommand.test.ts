import { describe, expect, it } from 'vitest';
import {
  commandMatchKey,
  exactCommandMatch,
  normalizeCommandQuery
} from '@libs/commands/matchCommand.ts';
import { COMMAND_REGISTRY, CommandId } from '@libs/commands/registry.ts';

describe('normalizeCommandQuery', () => {
  it('trims, lower-cases, and strips a single leading slash', () => {
    expect(normalizeCommandQuery('  /Clear ')).toBe('clear');
    expect(normalizeCommandQuery('CLEAR')).toBe('clear');
  });

  it('only strips the first leading slash', () => {
    expect(normalizeCommandQuery('//clear')).toBe('/clear');
  });
});

describe('commandMatchKey', () => {
  it('drops the leading slash and lower-cases the command name', () => {
    expect(commandMatchKey({ id: CommandId.Clear, name: '/Clear', description: '' })).toBe('clear');
  });
});

describe('exactCommandMatch', () => {
  it('resolves a full command name regardless of case or leading slash', () => {
    expect(exactCommandMatch('/clear')?.id).toBe(CommandId.Clear);
    expect(exactCommandMatch('CLEAR')?.id).toBe(CommandId.Clear);
    expect(exactCommandMatch('  exit  ')?.id).toBe(CommandId.Exit);
  });

  it('does not match a mere prefix', () => {
    expect(exactCommandMatch('/cl')).toBeUndefined();
  });

  it('returns undefined for an unknown command', () => {
    expect(exactCommandMatch('/zzz')).toBeUndefined();
  });

  it('matches every registered command by its own name', () => {
    for (const command of COMMAND_REGISTRY) {
      expect(exactCommandMatch(command.name)?.id).toBe(command.id);
    }
  });
});
