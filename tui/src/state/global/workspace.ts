import { atom } from 'jotai';

export const repoRootAtom = atom<string | undefined>(undefined);
export const productVersionAtom = atom('');
export const workspaceCwdAtom = atom('');
