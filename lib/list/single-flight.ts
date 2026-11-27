/**
 * One run of an async task at a time. `run(task)` asks for a fresh run: while one is out it only marks the
 * work dirty, and the run repeats once when it ends (however many calls came in), so nothing is lost and
 * nothing overlaps. The repeat uses the task of the latest call. `join(task)` only wants the answer: it
 * shares a run in flight without asking for a repeat, and starts one when idle. Both resolve when
 * everything they waited on is finished.
 */
export interface SingleFlight {
  run: (task: () => Promise<void>) => Promise<void>;
  join: (task: () => Promise<void>) => Promise<void>;
  /** A run is out right now. */
  busy: () => boolean;
}

export function singleFlight(): SingleFlight {
  let current: Promise<void> | null = null;
  let dirty = false;
  let latest: () => Promise<void> = async () => {};
  const start = (): Promise<void> => {
    current = (async () => {
      try {
        do {
          dirty = false;
          await latest();
        } while (dirty);
      } finally {
        current = null;
        dirty = false;
      }
    })();
    return current;
  };
  return {
    run: (task) => {
      latest = task;
      if (current) {
        dirty = true;
        return current;
      }
      return start();
    },
    join: (task) => {
      if (current) return current;
      latest = task;
      return start();
    },
    busy: () => current !== null,
  };
}

const OFFLINE_STEPS_MS = [5000, 10_000, 20_000, 30_000];

/** How long to wait before the next look while offline: 5, 10, 20, then every 30 seconds. */
export const backoffDelay = (attempt: number): number =>
  OFFLINE_STEPS_MS[Math.min(Math.max(0, attempt), OFFLINE_STEPS_MS.length - 1)];

/** A request that got no answer is not sent again for this long. */
export const FAILED_REQUEST_HOLD_MS = 60_000;

/** Milliseconds until a key may be asked again: 0 when it was never held or the hold is over. */
export const retryAfter = (retryAt: number | undefined, now = Date.now()): number =>
  retryAt === undefined ? 0 : Math.max(0, retryAt - now);

/**
 * Calls `attempt` after 5, 10, 20, then every 30 seconds until it resolves true. Returns the function that
 * stops it. An attempt that throws counts as a failed one.
 */
export function retryWithBackoff(attempt: () => Promise<boolean>): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let n = 0;
  const schedule = () => {
    timer = setTimeout(() => {
      attempt().then(
        (done) => {
          if (!done && !stopped) {
            n++;
            schedule();
          }
        },
        () => {
          if (!stopped) {
            n++;
            schedule();
          }
        },
      );
    }, backoffDelay(n));
  };
  schedule();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
