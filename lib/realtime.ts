import { createBrowserClient } from '@/lib/db/client';

const COALESCE_MS = 150;

/**
 * Calls `onChange` whenever one of `tables` changes for this household.
 * Deletes cannot be filtered by household, so a delete anywhere also triggers it;
 * the caller refetches, and never trusts the event's contents.
 * `onStatus(true)` fires once the connection is live (the caller should refetch then too).
 * Returns the function that stops listening.
 */
export function subscribeHousehold(
  householdId: string,
  tables: string[],
  onChange: () => void,
  onStatus?: (live: boolean) => void,
): () => void {
  const sb = createBrowserClient();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const fire = () => {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (!stopped) onChange();
    }, COALESCE_MS);
  };

  // A household's own row is keyed by id; every other table points at it with household_id.
  const filterFor = (table: string) => `${table === 'households' ? 'id' : 'household_id'}=eq.${householdId}`;

  let channel = sb.channel(`household-${householdId}-${Math.random().toString(36).slice(2, 8)}`);
  for (const table of tables) {
    channel = channel
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: filterFor(table) },
        fire,
      )
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, fire);
  }
  channel.subscribe((status) => {
    if (stopped) return;
    if (status === 'SUBSCRIBED') {
      onStatus?.(true);
      fire();
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      onStatus?.(false);
    }
  });

  const onVisible = () => {
    if (document.visibilityState === 'visible') fire();
  };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', fire);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', fire);
    void sb.removeChannel(channel);
  };
}
