import { atom } from 'jotai';
import { connectReturnToModelAtom, connectTargetProviderIdAtom } from '@state/ui/connect/index.ts';
import {
  MemoryMode,
  bumpMemoryRequestGenerationAtom,
  memoryModeAtom,
  resetMemorySubStateAtom
} from '@state/ui/memory/index.ts';

/** Mutually exclusive fullscreen surfaces the TUI shell can render. */
export const Surface = {
  Home: 'home',
  Help: 'help',
  Connect: 'connect',
  Model: 'model',
  Memory: 'memory',
  Theme: 'theme'
} as const;

export type Surface = (typeof Surface)[keyof typeof Surface];

/** The one active shell surface; opening one surface closes every other one. */
export const activeSurfaceAtom = atom<Surface>(Surface.Home);

const setActiveSurfaceAtom = atom(null, (_get, set, surface: Surface) => {
  set(activeSurfaceAtom, surface);
});

/** Returns to the transcript/composer surface from any active overlay. */
export const closeActiveSurfaceAtom = atom(null, (get, set) => {
  if (get(activeSurfaceAtom) === Surface.Memory) {
    set(bumpMemoryRequestGenerationAtom);
  }
  set(setActiveSurfaceAtom, Surface.Home);
});

export type OpenConnectOptions = { providerId?: string; returnToModel?: boolean };

/** Opens the provider connect surface. */
export const openConnectSurfaceAtom = atom(null, (_get, set, options: OpenConnectOptions | undefined = undefined) => {
  set(connectTargetProviderIdAtom, options?.providerId ?? null);
  set(connectReturnToModelAtom, options?.returnToModel ?? false);
  set(setActiveSurfaceAtom, Surface.Connect);
});

/** Opens the fullscreen help surface. */
export const openHelpSurfaceAtom = atom(null, (_get, set) => {
  set(setActiveSurfaceAtom, Surface.Help);
});

/** Opens the model picker front door. */
export const openModelSurfaceAtom = atom(null, (_get, set) => {
  set(setActiveSurfaceAtom, Surface.Model);
});

/** Opens the fullscreen local memory management surface. */
export const openMemorySurfaceAtom = atom(null, (_get, set, mode: MemoryMode = MemoryMode.Active) => {
  set(bumpMemoryRequestGenerationAtom);
  set(resetMemorySubStateAtom);
  set(memoryModeAtom, mode);
  set(setActiveSurfaceAtom, Surface.Memory);
});

/** Opens the fullscreen theme picker. No provider credentials are required. */
export const openThemeSurfaceAtom = atom(null, (_get, set) => {
  set(setActiveSurfaceAtom, Surface.Theme);
});
