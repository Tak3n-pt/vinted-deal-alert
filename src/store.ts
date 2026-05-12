import type { Listing, PhoneMatch, ScoredDeal } from "./types.js";
import type { HistoricalListing } from "./scoring.js";
import { effectivePrice } from "./scoring.js";
import { benchmarkKey } from "./phoneMatcher.js";
import { normalizeCondition } from "./scoring.js";
import { openSqlDatabase, type SqlDatabase } from "./sqlDatabase.js";

export interface DealStoreApi {
  saveObserved(listing: Listing, match: PhoneMatch): Promise<void>;
  recentHistory(days?: number): Promise<HistoricalListing[]>;
  /**
   * All alert operations are scoped to a single user so two users with
   * overlapping filters both get alerted on shared listings. `observed_listings`
   * stays global (more history = better benchmarks); only `sent_alerts` is
   * partitioned per user. `userId` defaults to 1 (seed admin) to preserve
   * single-tenant CLI usage (`npm run once`) and existing tests.
   */
  shouldSendAlert(deal: ScoredDeal, dropPercent?: number, userId?: number): Promise<boolean>;
  reserveAlert(deal: ScoredDeal, dropPercent?: number, userId?: number): Promise<boolean>;
  recordAlert(deal: ScoredDeal, userId?: number): Promise<void>;
  releaseAlert(deal: ScoredDeal, userId?: number): Promise<void>;
  alertsInLast24h(userId?: number): Promise<number>;
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

  async shouldSendAlert(deal: ScoredDeal, dropPercent?: number, userId: number = 1): Promise<boolean> {
    const previous = await this.db.get(
      "select price from sent_alerts where listing_id = ? and user_id = ?",
      [deal.listing.id, userId]
    );
    if (!previous) return true;
    const previousPrice = Number(previous.price);
    if (!Number.isFinite(previousPrice)) return true;
    const ratio = clampDropRatio(dropPercent ?? 0.10);
    return deal.finalPrice <= previousPrice * (1 - ratio);
  }

  async reserveAlert(deal: ScoredDeal, dropPercent?: number, userId: number = 1): Promise<boolean> {
    const staleReservedExpression =
      this.db.dialect === "postgres"
        ? "sent_alerts.reserved_at <= CURRENT_TIMESTAMP - interval '15 minutes'"
        : "sent_alerts.reserved_at <= datetime('now', '-15 minutes')";
    const ratio = clampDropRatio(dropPercent ?? 0.10);
    const keepFactor = 1 - ratio;
    const result = await this.db.run(
      `insert into sent_alerts
        (user_id, listing_id, price, score, url, status, reserved_at, sent_at)
       values (?, ?, ?, ?, ?, 'reserved', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       on conflict(user_id, listing_id) do update set
         price = excluded.price,
         score = excluded.score,
         url = excluded.url,
         status = 'reserved',
         reserved_at = CURRENT_TIMESTAMP,
         sent_at = CURRENT_TIMESTAMP
       where
         excluded.price <= sent_alerts.price * ?
         or (
           sent_alerts.status = 'reserved'
           and ${staleReservedExpression}
         )`,
      [userId, deal.listing.id, deal.finalPrice, deal.score, deal.listing.url, keepFactor]
    );

    return result.changes > 0;
  }

  async alertsInLast24h(userId: number = 1): Promise<number> {
    const sql =
      this.db.dialect === "postgres"
        ? "select count(*) as count from sent_alerts where user_id = ? and status = 'sent' and sent_at >= CURRENT_TIMESTAMP - interval '24 hours'"
        : "select count(*) as count from sent_alerts where user_id = ? and status = 'sent' and sent_at >= datetime('now', '-24 hours')";
    const row = await this.db.get(sql, [userId]);
    return Number(row?.count ?? 0);
  }

  async recordAlert(deal: ScoredDeal, userId: number = 1): Promise<void> {
    await this.db.run(
      `insert into sent_alerts
        (user_id, listing_id, price, score, url, status, reserved_at, sent_at)
       values (?, ?, ?, ?, ?, 'sent', null, CURRENT_TIMESTAMP)
       on conflict(user_id, listing_id) do update set
         price = excluded.price,
         score = excluded.score,
         url = excluded.url,
         status = 'sent',
         reserved_at = null,
         sent_at = CURRENT_TIMESTAMP`,
      [userId, deal.listing.id, deal.finalPrice, deal.score, deal.listing.url]
    );
  }

  async releaseAlert(deal: ScoredDeal, userId: number = 1): Promise<void> {
    await this.db.run(
      "delete from sent_alerts where listing_id = ? and user_id = ? and status = 'reserved'",
      [deal.listing.id, userId]
    );
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
      await this.applyMultiTenantAlerts();
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
    await this.applyMultiTenantAlerts();
  }

  /**
   * Partition `sent_alerts` per user so two users with overlapping filters
   * both get notified on shared listings. Idempotent: the presence of the
   * `user_id` column is the marker — if it already exists, skip the rebuild.
   * Existing rows backfill to user_id=1 (the seed admin).
   */
  private async applyMultiTenantAlerts(): Promise<void> {
    if (this.db.dialect === "postgres") {
      const userIdExists = await this.db.get(
        `select 1 as present from information_schema.columns
         where table_name = 'sent_alerts' and column_name = 'user_id'`
      );
      if (userIdExists) return;
      await this.db.exec(`
        alter table sent_alerts add column user_id integer not null default 1;
        alter table sent_alerts drop constraint sent_alerts_pkey;
        alter table sent_alerts add constraint sent_alerts_pkey primary key (user_id, listing_id);
      `);
      return;
    }
    // SQLite: check pragma for the column; if missing, rebuild the table with
    // a composite PK preserving all existing rows (backfilled to user_id=1).
    const cols = await this.db.all(`pragma table_info(sent_alerts)`);
    if (cols.some((row) => row.name === "user_id")) return;
    await this.db.exec(`
      create table sent_alerts_new (
        user_id integer not null default 1,
        listing_id text not null,
        price real not null,
        score integer not null,
        url text not null,
        status text not null default 'sent',
        reserved_at text,
        sent_at text not null,
        primary key (user_id, listing_id)
      );
      insert into sent_alerts_new (user_id, listing_id, price, score, url, status, reserved_at, sent_at)
      select 1, listing_id, price, score, url, status, reserved_at, sent_at from sent_alerts;
      drop table sent_alerts;
      alter table sent_alerts_new rename to sent_alerts;
    `);
  }

  private async addColumnIfMissing(table: string, column: string, definition: string): Promise<void> {
    const rows = await this.db.all(`pragma table_info(${table})`);
    if (rows.some((row) => row.name === column)) return;
    await this.db.exec(`alter table ${table} add column ${column} ${definition}`);
  }
}

function clampDropRatio(value: number): number {
  if (!Number.isFinite(value)) return 0.10;
  return Math.min(0.95, Math.max(0.01, value));
}
