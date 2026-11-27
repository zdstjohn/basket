import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';
import { refreshTokens, type UserTokens } from './oauth';
import { isVaultConfigured, seal, unseal } from './vault';

type Sb = SupabaseClient<Database>;
const EARLY_MS = 60_000;

function open(sealed: string, userId: string): UserTokens | null {
  const plain = unseal(sealed, userId);
  if (!plain) return null;
  try {
    const t = JSON.parse(plain) as Partial<UserTokens>;
    return typeof t.access === 'string' && typeof t.refresh === 'string' && typeof t.accessExp === 'number'
      ? { access: t.access, refresh: t.refresh, accessExp: t.accessExp }
      : null;
  } catch {
    return null;
  }
}

/** Keeps this person's tokens, sealed. Row-level security lets a person write only their own row. */
export async function saveLink(sb: Sb, userId: string, tokens: UserTokens, profileId: string | null): Promise<void> {
  const { error } = await sb
    .from('kroger_links')
    .upsert(
      { user_id: userId, sealed: seal(JSON.stringify(tokens), userId), profile_id: profileId, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
  if (error) throw new Error('kroger link save failed');
}

export async function deleteLink(sb: Sb, userId: string): Promise<void> {
  const { error } = await sb.from('kroger_links').delete().eq('user_id', userId);
  if (error) throw new Error('kroger link delete failed');
}

export async function linkStatus(sb: Sb, userId: string): Promise<{ connected: boolean; profileId: string | null }> {
  const { data } = await sb.from('kroger_links').select('profile_id').eq('user_id', userId).maybeSingle();
  return { connected: Boolean(data), profileId: data?.profile_id ?? null };
}

/** The row, or null when there is none. A database error throws Error('kroger link read failed'): it is not "not connected". */
async function readRow(sb: Sb, userId: string) {
  const { data, error } = await sb.from('kroger_links').select('sealed, profile_id, updated_at').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('kroger link read failed');
  return data;
}

/**
 * A working access token for this person, refreshed when it has under a minute left (or when `force`).
 * Null when not connected, when the row cannot be opened (wrong key: kept, a reconnect overwrites it), or when Kroger
 * refuses for a reason that is ours (kept). The row is deleted only when Kroger says the refresh token is dead.
 * Throws on a network or 5xx failure, and Error('kroger link read failed') on a database error.
 */
export async function getUserAccess(
  sb: Sb,
  userId: string,
  opts: { force?: boolean } = {},
): Promise<{ access: string; profileId: string | null } | null> {
  if (!isVaultConfigured()) return null;
  const row = await readRow(sb, userId);
  if (!row) return null;
  const tokens = open(row.sealed, userId);
  if (!tokens) return null;
  if (!opts.force && tokens.accessExp - Date.now() > EARLY_MS) return { access: tokens.access, profileId: row.profile_id };

  const next = await refreshTokens(tokens.refresh);
  if (next === 'rejected') return null;
  if (next === 'refused') {
    // Another request may have refreshed (and saved a newer link) while we waited: only delete the row we read.
    const now = await readRow(sb, userId);
    if (!now) return null;
    if (now.updated_at !== row.updated_at) {
      const theirs = open(now.sealed, userId);
      return theirs ? { access: theirs.access, profileId: now.profile_id } : null;
    }
    await sb.from('kroger_links').delete().eq('user_id', userId).eq('updated_at', row.updated_at);
    return null;
  }
  const { data: won } = await sb
    .from('kroger_links')
    .update({ sealed: seal(JSON.stringify(next), userId), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('updated_at', row.updated_at)
    .select('user_id');
  if (won && won.length > 0) return { access: next.access, profileId: row.profile_id };

  // Another request refreshed first (and Kroger may have retired our refresh token): use theirs.
  const again = await readRow(sb, userId);
  const theirs = again ? open(again.sealed, userId) : null;
  return again && theirs ? { access: theirs.access, profileId: again.profile_id } : null;
}
