import '@/devGlobals.ts';
import { render } from 'ink';
import { Provider } from 'jotai';
import { App } from '@/App.tsx';
import { createAppRuntime } from '@/bootstrap.ts';
import { finishSession } from '@components/exitSummary/finishSession.ts';

const { store, dispose } = await createAppRuntime({ entryUrl: import.meta.url });

const { waitUntilExit } = render(
  <Provider store={store}>
    <App />
  </Provider>,
  // Rewrite only changed lines instead of repainting the whole screen each
  // frame. Paired with FULLSCREEN_GUARD_ROWS keeping us under fullscreen, this
  // avoids the per-keystroke clear+repaint that blinks in WezTerm on Windows.
  { incrementalRendering: true }
);

// Restore the terminal, then print the exit summary card into the recovered
// scrollback. Shared with the packaged entry so exit behavior can't drift.
void waitUntilExit().finally(() => finishSession({ store, dispose }));
