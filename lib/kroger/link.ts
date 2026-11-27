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

const readRow = async (sb: Sb, userId: string) =>
  (await sb.from('kroger_links').select('sealed, profile_id, updated_at').eq('user_id', userId).maybeSingle()).data;

/**
 * A working access token for this person, refreshed when it has under a minute left (or when `force`).
 * Null when not connected, or when the link is dead (the row is then deleted). Throws on a network or 5xx failure.
 * With no key configured it answers null and leaves the row alone: a wrong or missing key must not erase good links.
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
  if (!tokens) {
    await sb.from('kroger_links').delete().eq('user_id', userId);
    return null;
  }
  if (!opts.force && tokens.accessExp - Date.now() > EARLY_MS) return { access: tokens.access, profileId: row.profile_id };

  const next = await refreshTokens(tokens.refresh);
  if (next === 'refused') {
    await sb.from('kroger_links').delete().eq('user_id', userId);
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
