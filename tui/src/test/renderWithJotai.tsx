import { render } from 'ink-testing-library';
import { createStore, Provider } from 'jotai';
import type { ReactElement } from 'react';

export function renderWithJotai(element: ReactElement): ReturnType<typeof render> {
  return render(<Provider store={createStore()}>{element}</Provider>);
}
