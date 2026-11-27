/**
 * Wraps a fetch so a request that never answers (weak store signal) fails after `ms` instead of
 * hanging. Only URLs that `applies` accepts are timed. On our own timeout it rejects with a
 * TypeError whose message matches the browser's "Failed to fetch", so the offline handling that
 * already exists treats it as a lost connection. A caller's own abort still aborts, with its own error.
 * Uses its own AbortController and timer, not AbortSignal.timeout or AbortSignal.any (older iPhones).
 */
export function timeoutFetch(inner: typeof fetch, ms: number, applies: (url: string) => boolean): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!applies(url)) return inner(input, init);

    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, ms);

    const caller = init?.signal ?? (typeof input === 'object' && 'signal' in input ? input.signal : undefined);
    const forward = () => ctl.abort(caller?.reason);
    if (caller) {
      if (caller.aborted) forward();
      else caller.addEventListener('abort', forward, { once: true });
    }

    return inner(input, { ...init, signal: ctl.signal })
      .catch((e: unknown) => {
        if (timedOut && !caller?.aborted) throw new TypeError('Failed to fetch (timeout)');
        throw e;
      })
      .finally(() => {
        clearTimeout(timer);
        caller?.removeEventListener('abort', forward);
      });
  };
}
