import type { RuntimeConfig, ScoredDeal } from "./types.js";

const MAX_WEBHOOK_RETRIES = 2;
const MAX_RETRY_WAIT_MS = 10_000;

// Discord requires bots to identify with a User-Agent in this format on every
// REST call. Without it, non-/users/@me endpoints return 403 + code 40333
// "internal network error". Webhooks tolerate the absence but bot DMs do not.
const DISCORD_USER_AGENT = "DiscordBot (https://bonoitec-home.vercel.app, 1.0)";

export class DiscordWebhook {
  constructor(private readonly config: RuntimeConfig) {}

  async sendDeal(deal: ScoredDeal): Promise<void> {
    const payload = buildDiscordPayload(deal);
    if (this.config.dryRun) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    if (!this.config.discordWebhookUrl) {
      throw new Error("DISCORD_WEBHOOK_URL est requis quand DRY_RUN=false");
    }
    await postWithRetry(this.config.discordWebhookUrl, payload);
  }

  async sendStatus(message: string): Promise<void> {
    const payload = {
      username: "Vinted Deal Alert",
      allowed_mentions: { parse: [] },
      content: message
    };

    if (this.config.dryRun) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    if (!this.config.discordWebhookUrl) {
      throw new Error("DISCORD_WEBHOOK_URL est requis quand DRY_RUN=false");
    }
    await postWithRetry(this.config.discordWebhookUrl, payload);
  }
}

/**
 * Retry the Discord webhook on 429 (rate-limit, honoring `Retry-After` /
 * `x-ratelimit-reset-after`) and 5xx. Bails after MAX_WEBHOOK_RETRIES so a
 * Discord outage doesn't block the scan loop indefinitely.
 */
async function postWithRetry(webhookUrl: string, payload: unknown): Promise<void> {
  let lastErrorBody = "";
  let lastStatus = 0;
  for (let attempt = 0; attempt <= MAX_WEBHOOK_RETRIES; attempt += 1) {
    const response = await fetch(`${webhookUrl}?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (response.ok) return;

    lastStatus = response.status;
    lastErrorBody = await response.text().catch(() => "");

    // Only retry on rate-limit and transient server errors.
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === MAX_WEBHOOK_RETRIES) break;

    const waitMs = computeBackoffMs(response, lastErrorBody, attempt);
    await sleep(waitMs);
  }
  throw new Error(`Webhook Discord en échec ${lastStatus} : ${lastErrorBody.slice(0, 300)}`);
}

function computeBackoffMs(response: Response, body: string, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  const resetAfter = response.headers.get("x-ratelimit-reset-after");
  const hinted = parseSeconds(retryAfter) ?? parseSeconds(resetAfter) ?? parseRetryAfterJson(body);
  // Exponential fallback: 500ms, 1500ms.
  const fallback = 500 * Math.pow(3, attempt);
  const chosen = hinted !== null ? hinted * 1000 : fallback;
  return Math.min(MAX_RETRY_WAIT_MS, Math.max(250, chosen));
}

function parseSeconds(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number.parseFloat(value);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function parseRetryAfterJson(body: string): number | null {
  try {
    const parsed = JSON.parse(body) as { retry_after?: unknown };
    if (typeof parsed.retry_after === "number") return parsed.retry_after;
    if (typeof parsed.retry_after === "string") return parseSeconds(parsed.retry_after);
  } catch {
    // Body wasn't JSON — fall through.
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildDiscordPayload(deal: ScoredDeal): Record<string, unknown> {
  const riskText = deal.risks.length
    ? deal.risks.map((risk) => `${risk.severity}: ${risk.label}`).join("\n")
    : "Aucun signal de risque majeur détecté";

  return {
    username: "Vinted Deal Alert",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `${deal.match.model}${deal.match.storageGb ? ` ${deal.match.storageGb} Go` : ""} - ${Math.round(deal.finalPrice)} EUR final`,
        url: deal.listing.url,
        color: colorForScore(deal.score),
        description: deal.reasons.join("\n"),
        fields: [
          {
            name: "Score",
            value: `${deal.score}/100`,
            inline: true
          },
          {
            name: "Référence marché",
            value: `${Math.round(deal.benchmarkPrice)} EUR`,
            inline: true
          },
          {
            name: "Prix final utilisé",
            value: `${Math.round(deal.finalPrice)} EUR`,
            inline: true
          },
          {
            name: "Remise",
            value: `${Math.round(deal.discountPercent * 100)}% (${Math.round(deal.savings)} EUR)`,
            inline: true
          },
          {
            name: "Vendeur",
            value: sellerText(deal),
            inline: true
          },
          {
            name: "État",
            value: deal.listing.condition || "Inconnu",
            inline: true
          },
          {
            name: "Notes de risque",
            value: truncate(riskText, 900),
            inline: false
          }
        ],
        image: deal.listing.imageUrl ? { url: deal.listing.imageUrl } : undefined,
        footer: { text: "Vérification manuelle requise avant achat. Le bot n’achète pas et ne contacte pas les vendeurs." },
        timestamp: new Date().toISOString()
      }
    ]
  };
}

function sellerText(deal: ScoredDeal): string {
  const name = deal.listing.sellerName ?? "Inconnu";
  const rating = deal.listing.sellerRating !== undefined ? `${deal.listing.sellerRating}/5` : "sans note";
  const reviews = deal.listing.sellerReviews !== undefined ? `${deal.listing.sellerReviews} avis` : "sans avis";
  return `${name}\n${rating}, ${reviews}`;
}

function colorForScore(score: number): number {
  if (score >= 80) return 0x16a34a;
  if (score >= 65) return 0xeab308;
  return 0x64748b;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

export interface DiscordDelivererOptions {
  discordUserId: string | null;
  webhookUrl: string | null;
  botToken: string | null;
  dryRun: boolean;
}

/**
 * Per-user deal/status sender. Tries Discord DM first (requires the user to
 * share the Bonoitec Hub guild with the bot — handled by OAuth `guilds.join`).
 * Falls back to the legacy webhook URL on DM 403/404 so users who haven't
 * re-authenticated since the migration still get alerts.
 */
export class DiscordDeliverer {
  private readonly dm: DiscordDM | null;
  private readonly webhook: DiscordWebhook | null;

  constructor(private readonly options: DiscordDelivererOptions) {
    this.dm = options.discordUserId && options.botToken
      ? new DiscordDM(options.botToken)
      : null;
    this.webhook = options.webhookUrl
      ? new DiscordWebhook({ discordWebhookUrl: options.webhookUrl, dryRun: options.dryRun } as RuntimeConfig)
      : null;
  }

  async sendDeal(deal: ScoredDeal): Promise<void> {
    if (this.options.dryRun) {
      // Reuse webhook's dry-run logging — it just console.logs the payload.
      if (this.webhook) return this.webhook.sendDeal(deal);
      if (this.dm) return this.dm.sendDeal(this.options.discordUserId as string, deal);
      console.log(JSON.stringify(buildDiscordPayload(deal), null, 2));
      return;
    }
    if (this.dm && this.options.discordUserId) {
      try {
        await this.dm.sendDeal(this.options.discordUserId, deal);
        return;
      } catch (dmError) {
        if (!this.webhook) throw dmError;
        // Webhook fallback only for transient/auth DM failures; still throw if
        // both channels fail so the caller can release the alert reservation.
      }
    }
    if (this.webhook) {
      await this.webhook.sendDeal(deal);
      return;
    }
    throw new Error("Aucun canal de livraison Discord disponible (ni DM ni webhook)");
  }

  async sendStatus(message: string): Promise<void> {
    if (this.options.dryRun) {
      if (this.webhook) return this.webhook.sendStatus(message);
      return;
    }
    if (this.dm && this.options.discordUserId) {
      try {
        await this.dm.sendStatus(this.options.discordUserId, message);
        return;
      } catch {
        // Status pings are best-effort — fall back silently.
      }
    }
    if (this.webhook) await this.webhook.sendStatus(message);
  }
}

/**
 * Send deal alerts directly as Discord DMs using the bot's REST API.
 * Requires the user and the bot to share at least one guild (the Bonoitec Hub,
 * which users are auto-joined to during OAuth callback).
 */
export class DiscordDM {
  // Process-wide cache: Discord user ID -> opened DM channel ID. Discord
  // returns the same channel ID on repeat calls, so caching just avoids the
  // extra HTTP round-trip.
  private static readonly dmChannelCache = new Map<string, string>();

  constructor(private readonly botToken: string) {}

  async sendDeal(discordUserId: string, deal: ScoredDeal): Promise<void> {
    const { username: _ignored, ...payload } = buildDiscordPayload(deal);
    await this.sendMessage(discordUserId, payload);
  }

  async sendStatus(discordUserId: string, message: string): Promise<void> {
    await this.sendMessage(discordUserId, {
      content: message,
      allowed_mentions: { parse: [] }
    });
  }

  private async sendMessage(userId: string, payload: object): Promise<void> {
    const channelId = await this.openDM(userId);
    let lastBody = "";
    let lastStatus = 0;
    for (let attempt = 0; attempt <= MAX_WEBHOOK_RETRIES; attempt += 1) {
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: "POST",
        headers: {
          authorization: `Bot ${this.botToken}`,
          "content-type": "application/json",
          "user-agent": DISCORD_USER_AGENT
        },
        body: JSON.stringify(payload)
      });
      if (response.ok) return;

      lastStatus = response.status;
      lastBody = await response.text().catch(() => "");

      // 403 = user blocked the bot or disabled DMs. 404 = channel gone.
      // Drop the cache so the next attempt re-opens the DM channel cleanly.
      if (response.status === 403 || response.status === 404) {
        DiscordDM.dmChannelCache.delete(userId);
        break;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === MAX_WEBHOOK_RETRIES) break;
      await sleep(computeBackoffMs(response, lastBody, attempt));
    }
    throw new Error(`DM Discord en échec ${lastStatus} : ${lastBody.slice(0, 300)}`);
  }

  private async openDM(userId: string): Promise<string> {
    const cached = DiscordDM.dmChannelCache.get(userId);
    if (cached) return cached;

    const response = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: {
        authorization: `Bot ${this.botToken}`,
        "content-type": "application/json",
        "user-agent": DISCORD_USER_AGENT
      },
      body: JSON.stringify({ recipient_id: userId })
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Ouverture DM échouée ${response.status} : ${body.slice(0, 300)}`);
    }
    const data = (await response.json()) as { id: string };
    DiscordDM.dmChannelCache.set(userId, data.id);
    return data.id;
  }
}
