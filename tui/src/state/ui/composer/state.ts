import { atom } from 'jotai';
import { INITIAL_COMPOSER_STATE } from '@constants/composer.ts';
import type { ComposerState } from '@libs/composer/types.ts';

export const composerStateAtom = atom<ComposerState>({ ...INITIAL_COMPOSER_STATE });
