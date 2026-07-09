import { atom } from 'jotai';
import { PROVIDER_STATUS_CONNECTED } from '@contracts/backend/providerMessages.ts';
import { backendClientAtom } from '@state/global/backend.ts';

/** Mutually exclusive fullscreen surfaces the TUI shell can render. */
export const Surface = {
  Home: 'home',
  Help: 'help',
  Login: 'login',
  Model: 'model',
  Resume: 'resume',
  Memory: 'memory'
} as const;

export type Surface = (typeof Surface)[keyof typeof Surface];

/** The one active shell surface; opening one surface closes every other one. */
export const activeSurfaceAtom = atom<Surface>(Surface.Home);

const surfaceNavigationVersionAtom = atom(0);

const setActiveSurfaceAtom = atom(null, (_get, set, surface: Surface) => {
  set(surfaceNavigationVersionAtom, (version) => version + 1);
  set(activeSurfaceAtom, surface);
});

/** Returns to the transcript/composer surface from any active overlay. */
export const closeActiveSurfaceAtom = atom(null, (_get, set) => {
  set(setActiveSurfaceAtom, Surface.Home);
});

/** Opens the provider login surface. */
export const openLoginSurfaceAtom = atom(null, (_get, set) => {
  set(setActiveSurfaceAtom, Surface.Login);
});

/** Opens the fullscreen help surface. */
export const openHelpSurfaceAtom = atom(null, (_get, set) => {
  set(setActiveSurfaceAtom, Surface.Help);
});

/**
 * Opens the model picker when at least one provider is connected; otherwise
 * routes to login so the model surface is never empty on first open.
 */
export const openModelSurfaceAtom = atom(null, async (get, set) => {
  const client = get(backendClientAtom);
  if (client === undefined) {
    set(setActiveSurfaceAtom, Surface.Login);
    return;
  }

  const requestVersion = get(surfaceNavigationVersionAtom) + 1;
  set(surfaceNavigationVersionAtom, requestVersion);

  try {
    const providerList = await client.listProviders();
    if (get(surfaceNavigationVersionAtom) !== requestVersion) {
      return;
    }
    const nextSurface = providerList.providers.some((provider) => provider.status === PROVIDER_STATUS_CONNECTED)
      ? Surface.Model
      : Surface.Login;
    set(activeSurfaceAtom, nextSurface);
  } catch {
    if (get(surfaceNavigationVersionAtom) === requestVersion) {
      set(activeSurfaceAtom, Surface.Login);
    }
  }
});

/** Opens the fullscreen local session-resume picker. */
export const openResumeSurfaceAtom = atom(null, (_get, set) => {
  set(setActiveSurfaceAtom, Surface.Resume);
});

/** Opens the fullscreen local memory management surface. */
export const openMemorySurfaceAtom = atom(null, (_get, set) => {
  set(setActiveSurfaceAtom, Surface.Memory);
});
