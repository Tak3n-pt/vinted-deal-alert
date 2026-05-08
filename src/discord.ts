import type { RuntimeConfig, ScoredDeal } from "./types.js";

export class DiscordWebhook {
  constructor(private readonly config: RuntimeConfig) {}

  async sendDeal(deal: ScoredDeal): Promise<void> {
    const payload = buildDiscordPayload(deal);
    if (this.config.dryRun) {
      console.log(JSON.stringify(payload, null, 2));
      return;
    }
    if (!this.config.discordWebhookUrl) {
      throw new Error("DISCORD_WEBHOOK_URL is required when DRY_RUN=false");
    }

    const response = await fetch(`${this.config.discordWebhookUrl}?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Discord webhook failed ${response.status}: ${body.slice(0, 300)}`);
    }
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
      throw new Error("DISCORD_WEBHOOK_URL is required when DRY_RUN=false");
    }

    const response = await fetch(`${this.config.discordWebhookUrl}?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Discord webhook failed ${response.status}: ${body.slice(0, 300)}`);
    }
  }
}

export function buildDiscordPayload(deal: ScoredDeal): Record<string, unknown> {
  const riskText = deal.risks.length
    ? deal.risks.map((risk) => `${risk.severity}: ${risk.label}`).join("\n")
    : "No major risk signals detected";

  return {
    username: "Vinted Deal Alert",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: `${deal.match.model}${deal.match.storageGb ? ` ${deal.match.storageGb}GB` : ""} - ${Math.round(deal.finalPrice)} EUR final`,
        url: deal.listing.url,
        color: colorForScore(deal.score),
        description: deal.reasons.join("\n"),
        fields: [
          {
            name: "Deal score",
            value: `${deal.score}/100`,
            inline: true
          },
          {
            name: "Benchmark",
            value: `${Math.round(deal.benchmarkPrice)} EUR`,
            inline: true
          },
          {
            name: "Final cost used",
            value: `${Math.round(deal.finalPrice)} EUR`,
            inline: true
          },
          {
            name: "Discount",
            value: `${Math.round(deal.discountPercent * 100)}% (${Math.round(deal.savings)} EUR)`,
            inline: true
          },
          {
            name: "Seller",
            value: sellerText(deal),
            inline: true
          },
          {
            name: "Condition",
            value: deal.listing.condition || "Unknown",
            inline: true
          },
          {
            name: "Risk notes",
            value: truncate(riskText, 900),
            inline: false
          }
        ],
        image: deal.listing.imageUrl ? { url: deal.listing.imageUrl } : undefined,
        footer: { text: "Manual review required before purchase. Bot does not buy or message sellers." },
        timestamp: new Date().toISOString()
      }
    ]
  };
}

function sellerText(deal: ScoredDeal): string {
  const name = deal.listing.sellerName ?? "Unknown";
  const rating = deal.listing.sellerRating !== undefined ? `${deal.listing.sellerRating}/5` : "no rating";
  const reviews = deal.listing.sellerReviews !== undefined ? `${deal.listing.sellerReviews} reviews` : "no reviews";
  return `${name}\n${rating}, ${reviews}`;
}

function colorForScore(score: number): number {
  if (score >= 90) return 0x16a34a;
  if (score >= 82) return 0xeab308;
  return 0x64748b;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
