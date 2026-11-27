import type { Person } from '@/lib/domain/types';

/**
 * Keeps a screen's list of people current: loads once, loads again on Retry and whenever the household
 * says someone changed. A load that works clears the failure message, whichever load it was.
 * A live refetch that fails leaves things as they are.
 */
export function watchPeople(opts: {
  load: () => Promise<Person[]>;
  subscribe: (onChange: () => void) => () => void;
  onPeople: (people: Person[]) => void;
  onFailed: (failed: boolean) => void;
}): { retry: () => void; stop: () => void } {
  let alive = true;
  const fetch = (visible: boolean): void => {
    if (visible) opts.onFailed(false);
    opts.load().then(
      (list) => {
        if (!alive) return;
        opts.onPeople(list);
        opts.onFailed(false);
      },
      () => {
        if (alive && visible) opts.onFailed(true);
      },
    );
  };
  const unsubscribe = opts.subscribe(() => fetch(false));
  fetch(true);
  return {
    retry: () => fetch(true),
    stop: () => {
      alive = false;
      unsubscribe();
    },
  };
}
