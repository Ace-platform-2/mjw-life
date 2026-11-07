import { createClient } from '@supabase/supabase-js';

export async function workspaceAccess(token) {
  const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key } = process.env;
  if (!token) return 401;
  if (!url || !key) return 503;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return 401;
  const memberClient = createClient(url, key, { accessToken: async () => token });
  const membership = await memberClient.from('life_workspace_members').select('user_id')
    .eq('user_id', data.user.id).maybeSingle();
  return membership.error || !membership.data ? 403 : 200;
}
