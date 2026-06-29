import { createStore, Provider } from 'jotai';
import { useLayoutEffect, useRef } from 'react';
import { HomeScreenView } from '@components/HomeScreen/HomeScreenView.js';
import { homeScreenConfigAtom } from '@state/homeScreenAtoms.js';
import type { HomeScreenConfig } from '@state/homeScreenAtoms.js';

export type HomeScreenProps = {
  config: HomeScreenConfig;
};

export function HomeScreen({ config }: HomeScreenProps) {
  const store = useHomeScreenStore(config);

  return (
    <Provider store={store}>
      <HomeScreenView />
    </Provider>
  );
}

function useHomeScreenStore(config: HomeScreenConfig): ReturnType<typeof createStore> {
  const storeRef = useRef<ReturnType<typeof createStore> | null>(null);

  if (storeRef.current === null) {
    const store = createStore();
    store.set(homeScreenConfigAtom, config);
    storeRef.current = store;
  }

  useLayoutEffect(() => {
    storeRef.current?.set(homeScreenConfigAtom, config);
  }, [config]);

  return storeRef.current;
}
