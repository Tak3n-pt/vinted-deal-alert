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
      throw new Error("DISCORD_WEBHOOK_URL est requis quand DRY_RUN=false");
    }

    const response = await fetch(`${this.config.discordWebhookUrl}?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Webhook Discord en échec ${response.status} : ${body.slice(0, 300)}`);
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
      throw new Error("DISCORD_WEBHOOK_URL est requis quand DRY_RUN=false");
    }

    const response = await fetch(`${this.config.discordWebhookUrl}?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Webhook Discord en échec ${response.status} : ${body.slice(0, 300)}`);
    }
  }
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
  if (score >= 90) return 0x16a34a;
  if (score >= 82) return 0xeab308;
  return 0x64748b;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}
