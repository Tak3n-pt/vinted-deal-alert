import { randomBytes } from "node:crypto";
import type { DiscordProfile } from "./dashboardTypes.js";

const DISCORD_AUTHORIZE_URL = "https://discord.com/api/oauth2/authorize";
const DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token";
const DISCORD_ME_URL = "https://discord.com/api/users/@me";

export interface DiscordOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function loadDiscordOAuthConfig(): DiscordOAuthConfig | null {
  const clientId = process.env.DISCORD_OAUTH_CLIENT_ID;
  const clientSecret = process.env.DISCORD_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function generateOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function buildAuthorizeUrl(config: DiscordOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "identify email",
    state,
    prompt: "consent"
  });
  return `${DISCORD_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(config: DiscordOAuthConfig, code: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri
  });
  const response = await fetch(DISCORD_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Discord token exchange failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("Discord token exchange returned no access_token");
  return payload.access_token;
}

export async function fetchDiscordProfile(accessToken: string): Promise<DiscordProfile> {
  const response = await fetch(DISCORD_ME_URL, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Discord /users/@me failed (${response.status}): ${detail.slice(0, 200)}`);
  }
  const payload = (await response.json()) as DiscordProfile;
  if (!payload.id) throw new Error("Discord profile response missing id");
  return payload;
}

export function isBetaAllowed(discordId: string): boolean {
  const list = process.env.BETA_DISCORD_IDS;
  if (!list) return true;
  return list.split(",").map((id) => id.trim()).filter(Boolean).includes(discordId);
}
