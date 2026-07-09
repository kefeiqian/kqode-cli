import { RequestType, RequestType0 } from 'vscode-jsonrpc';
import { THEME_GET_METHOD, THEME_SET_METHOD } from '@contracts/backend/index.ts';
import type { ThemeGetResult, ThemeSetParams, ThemeSetResult } from '@contracts/backend/index.ts';

/** Typed descriptor for the parameterless `kqode.theme.get` request. */
export const themeGetRequest = new RequestType0<ThemeGetResult, void>(THEME_GET_METHOD);

/** Typed descriptor for the `kqode.theme.set` request. */
export const themeSetRequest = new RequestType<ThemeSetParams, ThemeSetResult, void>(
  THEME_SET_METHOD
);
