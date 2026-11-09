// Logowanie w Discord Activity: wymienia kod z SDK na użytkownika Discorda, w razie potrzeby wydaje sesję
// Supabase i zapisuje, że gracz uruchomił Activity na danym serwerze. Opis: docs/discord-activity.md, 4.2 i 4.3.
// Sekrety DISCORD_CLIENT_SECRET i DISCORD_BOT_TOKEN są tylko w Supabase Secrets. Identyfikator serwera
// pochodzi z API Discorda, nigdy od klienta.
import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

const DISCORD_CLIENT_ID = '1567394206391996457';
const DISCORD_API = 'https://discord.com/api/v10';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fail = (step: string, error: string, status = 400) => json({ step, error }, status);

function serverClient() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Serwer instancji, o ile gracz faktycznie w niej jest. Null dla DM i przy każdym błędzie.
async function verifiedGuild(instanceId: unknown, discordId: string): Promise<string | null> {
  const bot = Deno.env.get('DISCORD_BOT_TOKEN');
  if (!bot || typeof instanceId !== 'string' || !/^[\w-]+$/.test(instanceId)) return null;
  const res = await fetch(`${DISCORD_API}/applications/${DISCORD_CLIENT_ID}/activity-instances/${instanceId}`, {
    headers: { Authorization: `Bot ${bot}` },
  });
  if (!res.ok) return null;
  const instance = await res.json();
  if (!Array.isArray(instance.users) || !instance.users.includes(discordId)) return null;
  return instance.location?.guild_id ?? null;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return fail('request', 'Dozwolona jest tylko metoda POST', 405);
  const body = await req.json().catch(() => null);
  const code = body && typeof body.code === 'string' ? body.code : '';
  if (!code) return fail('request', 'Brak kodu logowania');

  const secret = Deno.env.get('DISCORD_CLIENT_SECRET');
  if (!secret) return fail('config', 'Brak sekretu Discorda w konfiguracji', 500);

  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: DISCORD_CLIENT_ID, client_secret: secret, grant_type: 'authorization_code', code }),
  });
  if (!tokenRes.ok) return fail('discord-token', 'Discord odrzucił kod logowania', 401);
  const { access_token: discordToken } = await tokenRes.json();

  const userRes = await fetch(`${DISCORD_API}/users/@me`, { headers: { Authorization: `Bearer ${discordToken}` } });
  if (!userRes.ok) return fail('discord-user', 'Nie udało się odczytać konta Discord', 401);
  const discord = await userRes.json();
  if (!discord.email || !discord.verified) {
    return fail('discord-email', 'Konto Discord musi mieć potwierdzony adres e-mail', 403);
  }

  const supabase = serverClient();
  let userId: string | null = null;
  let session: { access_token: string; refresh_token: string } | null = null;

  // Istniejąca sesja wystarcza, jeśli należy do tego samego konta Discord.
  if (typeof body.user_token === 'string') {
    const { data } = await supabase.auth.getUser(body.user_token);
    if (data.user?.email?.toLowerCase() === discord.email.toLowerCase()) userId = data.user.id;
  }

  if (!userId) {
    // Niczego nie wysyła: tworzy konto, jeśli go nie ma, i zwraca jednorazowy skrót do wymiany na sesję.
    const { data: link, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: discord.email,
      options: {
        data: {
          provider_id: discord.id,
          name: discord.username,
          full_name: discord.global_name || discord.username,
          custom_claims: { global_name: discord.global_name },
        },
      },
    });
    if (linkError || !link?.properties?.hashed_token) {
      return fail('link', linkError?.message ?? 'Nie udało się przygotować sesji', 500);
    }

    // Konto powiązane z innym kontem Discord nie może przejąć tej sesji.
    const linked = link.user?.identities?.find(i => i.provider === 'discord');
    const linkedId = linked?.identity_data?.provider_id ?? linked?.identity_data?.sub;
    if (linkedId && linkedId !== discord.id) return fail('identity', 'To konto jest powiązane z innym kontem Discord', 403);

    const { data: verified, error: verifyError } = await serverClient().auth.verifyOtp({
      token_hash: link.properties.hashed_token,
      type: 'email',
    });
    if (verifyError || !verified.session || !verified.user) {
      return fail('verify', verifyError?.message ?? 'Nie udało się utworzyć sesji', 500);
    }
    userId = verified.user.id;
    session = { access_token: verified.session.access_token, refresh_token: verified.session.refresh_token };
  }

  const guildId = await verifiedGuild(body.instance_id, discord.id);
  if (guildId) {
    const { error } = await supabase.from('guild_players').upsert({ guild_id: guildId, user_id: userId, last_seen: new Date().toISOString() });
    if (error) return json({ discord_token: discordToken, session, guild_id: null });
  }

  return json({ discord_token: discordToken, session, guild_id: guildId });
});
