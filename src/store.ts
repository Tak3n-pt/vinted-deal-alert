import type { Listing, PhoneMatch, ScoredDeal } from "./types.js";
import type { HistoricalListing } from "./scoring.js";
import { effectivePrice } from "./scoring.js";
import { benchmarkKey } from "./phoneMatcher.js";
import { normalizeCondition } from "./scoring.js";
import { openSqlDatabase, type SqlDatabase } from "./sqlDatabase.js";

export interface DealStoreApi {
  saveObserved(listing: Listing, match: PhoneMatch): Promise<void>;
  recentHistory(days?: number): Promise<HistoricalListing[]>;
  shouldSendAlert(deal: ScoredDeal): Promise<boolean>;
  reserveAlert(deal: ScoredDeal): Promise<boolean>;
  recordAlert(deal: ScoredDeal): Promise<void>;
  releaseAlert(deal: ScoredDeal): Promise<void>;
}

export class DealStore implements DealStoreApi {
  private constructor(private readonly db: SqlDatabase) {}

  static async open(databasePath: string): Promise<DealStore> {
    const store = new DealStore(await openSqlDatabase(databasePath));
    await store.migrate();
    return store;
  }

  async saveObserved(listing: Listing, match: PhoneMatch): Promise<void> {
    const conditionBucket = normalizeCondition(listing.condition ?? listing.description);
    const key = benchmarkKey(match, conditionBucket);
    await this.db.run(
      `insert into observed_listings
        (id, benchmark_key, title, price, currency, url, listed_at, observed_at)
       values (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       on conflict(id) do update set
         benchmark_key = excluded.benchmark_key,
         title = excluded.title,
         price = excluded.price,
         currency = excluded.currency,
         url = excluded.url,
         listed_at = excluded.listed_at,
         observed_at = CURRENT_TIMESTAMP`,
      [listing.id, key, listing.title, effectivePrice(listing), listing.currency, listing.url, listing.listedAt ?? null]
    );
  }

  async recentHistory(days = 21): Promise<HistoricalListing[]> {
    const rows =
      this.db.dialect === "postgres"
        ? await this.db.all(
            `select benchmark_key, price, listed_at
             from observed_listings
             where observed_at >= CURRENT_TIMESTAMP - (?::int * interval '1 day')
               and price >= 100`,
            [days]
          )
        : await this.db.all(
            `select benchmark_key, price, listed_at
             from observed_listings
             where observed_at >= datetime('now', ?)
               and price >= 100`,
            [`-${days} days`]
          );

    return rows.map((row) => {
      const entry: HistoricalListing = {
        benchmarkKey: String(row.benchmark_key),
        price: Number(row.price)
      };
      if (typeof row.listed_at === "string") entry.listedAt = row.listed_at;
      return entry;
    });
  }

  async shouldSendAlert(deal: ScoredDeal): Promise<boolean> {
    const previous = await this.db.get("select price from sent_alerts where listing_id = ?", [deal.listing.id]);
    if (!previous) return true;
    const previousPrice = Number(previous.price);
    return Number.isFinite(previousPrice) && deal.finalPrice <= previousPrice * 0.9;
  }

  async reserveAlert(deal: ScoredDeal): Promise<boolean> {
    const staleReservedExpression =
      this.db.dialect === "postgres"
        ? "sent_alerts.reserved_at <= CURRENT_TIMESTAMP - interval '15 minutes'"
        : "sent_alerts.reserved_at <= datetime('now', '-15 minutes')";
    const result = await this.db.run(
      `insert into sent_alerts
        (listing_id, price, score, url, status, reserved_at, sent_at)
       values (?, ?, ?, ?, 'reserved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       on conflict(listing_id) do update set
         price = excluded.price,
         score = excluded.score,
         url = excluded.url,
         status = 'reserved',
         reserved_at = CURRENT_TIMESTAMP,
         sent_at = CURRENT_TIMESTAMP
       where
         excluded.price <= sent_alerts.price * 0.9
         or (
           sent_alerts.status = 'reserved'
           and ${staleReservedExpression}
         )`,
      [deal.listing.id, deal.finalPrice, deal.score, deal.listing.url]
    );

    return result.changes > 0;
  }

  async recordAlert(deal: ScoredDeal): Promise<void> {
    await this.db.run(
      `insert into sent_alerts
        (listing_id, price, score, url, status, reserved_at, sent_at)
       values (?, ?, ?, ?, 'sent', null, CURRENT_TIMESTAMP)
       on conflict(listing_id) do update set
         price = excluded.price,
         score = excluded.score,
         url = excluded.url,
         status = 'sent',
         reserved_at = null,
         sent_at = CURRENT_TIMESTAMP`,
      [deal.listing.id, deal.finalPrice, deal.score, deal.listing.url]
    );
  }

  async releaseAlert(deal: ScoredDeal): Promise<void> {
    await this.db.run("delete from sent_alerts where listing_id = ? and status = 'reserved'", [deal.listing.id]);
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  private async migrate(): Promise<void> {
    if (this.db.dialect === "postgres") {
      await this.db.exec(`
        create table if not exists observed_listings (
          id text primary key,
          benchmark_key text not null,
          title text not null,
          price real not null,
          currency text not null,
          url text not null,
          listed_at text,
          observed_at timestamptz not null
        );

        create index if not exists idx_observed_benchmark
          on observed_listings (benchmark_key, observed_at);

        create table if not exists sent_alerts (
          listing_id text primary key,
          price real not null,
          score integer not null,
          url text not null,
          status text not null default 'sent',
          reserved_at timestamptz,
          sent_at timestamptz not null
        );
      `);
      return;
    }

    await this.db.exec(`
      create table if not exists observed_listings (
        id text primary key,
        benchmark_key text not null,
        title text not null,
        price real not null,
        currency text not null,
        url text not null,
        listed_at text,
        observed_at text not null
      );

      create index if not exists idx_observed_benchmark
        on observed_listings (benchmark_key, observed_at);

      create table if not exists sent_alerts (
        listing_id text primary key,
        price real not null,
        score integer not null,
        url text not null,
        status text not null default 'sent',
        reserved_at text,
        sent_at text not null
      );
    `);
    await this.addColumnIfMissing("sent_alerts", "status", "text not null default 'sent'");
    await this.addColumnIfMissing("sent_alerts", "reserved_at", "text");
  }

  private async addColumnIfMissing(table: string, column: string, definition: string): Promise<void> {
    const rows = await this.db.all(`pragma table_info(${table})`);
    if (rows.some((row) => row.name === column)) return;
    await this.db.exec(`alter table ${table} add column ${column} ${definition}`);
  }
}
