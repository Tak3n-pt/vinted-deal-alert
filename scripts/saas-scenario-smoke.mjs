import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createDashboardHandler } from "../dist/src/dashboardServer.js";
import { DashboardStore } from "../dist/src/dashboardStore.js";
import { DealStore } from "../dist/src/store.js";
import { BotController } from "../dist/src/botController.js";

const previousEnv = {
  databaseUrl: process.env.DATABASE_URL,
  botSyncSecret: process.env.BOT_SYNC_SECRET,
  proQuota: process.env.PRO_DAILY_APIFY_QUOTA,
  freeQuota: process.env.FREE_DAILY_APIFY_QUOTA,
  adminPassword: process.env.DASHBOARD_ADMIN_PASSWORD
};

delete process.env.DATABASE_URL;
process.env.BOT_SYNC_SECRET = "local-smoke-sync-secret";
process.env.PRO_DAILY_APIFY_QUOTA = "777";
process.env.FREE_DAILY_APIFY_QUOTA = "33";
process.env.DASHBOARD_ADMIN_PASSWORD = "local-smoke-admin-password";

const tmp = mkdtempSync(join(tmpdir(), "vinted-saas-smoke-"));
const databasePath = join(tmp, "deals.sqlite");
const staticDir = join(tmp, "static");
writeFileSync(join(tmp, "static-placeholder"), "");

const providerState = { calls: 0, bodies: [] };
const providerServer = createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }
  providerState.calls += 1;
  providerState.bodies.push(await readJson(req));
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify([phoneListing()]));
});

const discordState = { posts: 0, payloads: [] };
const discordServer = createServer(async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }
  discordState.posts += 1;
  discordState.payloads.push(await readJson(req));
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true }));
});

const apiServer = createServer();

const results = [];
let dashboardStore;
let dealStore;
let providerOrigin = "";
let discordWebhookUrl = "";

try {
  providerOrigin = await listen(providerServer);
  const discordOrigin = await listen(discordServer);
  discordWebhookUrl = `${discordOrigin}/api/webhooks/123456789012345678/fakeTokenForSmoke`;

  dashboardStore = await DashboardStore.open(databasePath);
  dealStore = await DealStore.open(databasePath);

  const fallbackSearches = [{ market: "FR", query: "iphone 15 pro max 256go", limit: 10, sort: "newest" }];
  await dashboardStore.ensureDefaults(fallbackSearches);

  const baseConfig = config({
    databasePath,
    authorizedDataApiUrl: providerOrigin,
    discordWebhookUrl
  });
  const fakeController = {
    status: async () => ({ running: true, paused: false, scanInFlight: false }),
    scanNow: async () => undefined,
    pause: async () => ({ running: false, paused: true, scanInFlight: false }),
    resume: async () => ({ running: true, paused: false, scanInFlight: false }),
    testDiscord: async () => undefined
  };
  apiServer.on("request", createDashboardHandler({
    baseConfig,
    fallbackSearches,
    dashboardStore,
    controller: fakeController,
    adminPassword: "local-smoke-admin-password",
    staticDir
  }));
  const apiOrigin = await listen(apiServer);

  const missingSecret = await postJson(`${apiOrigin}/api/internal/subscription-sync`, {
    discordId: "123456789012345678",
    active: true
  });
  assert.equal(missingSecret.status, 401);
  results.push("bad sync secret rejected");

  const badDiscordId = await postJson(`${apiOrigin}/api/internal/subscription-sync`, {
    discordId: "not-a-discord-id",
    active: true
  }, { authorization: "Bearer local-smoke-sync-secret" });
  assert.equal(badDiscordId.status, 400);
  results.push("bad Discord ID rejected");

  const paid = await postJson(`${apiOrigin}/api/internal/subscription-sync`, {
    discordId: "123456789012345678",
    active: true,
    plan: "monthly",
    eventType: "checkout.session.completed"
  }, { authorization: "Bearer local-smoke-sync-secret" });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.user.plan, "pro");
  assert.equal(paid.body.user.dailyApifyQuota, 777);
  assert.equal(paid.body.user.betaApproved, true);
  results.push("paid subscription upgrades bot user");

  const paidUser = await dashboardStore.getUserByDiscordId("123456789012345678");
  assert.ok(paidUser);
  await dashboardStore.updateUserSettings(paidUser.id, {
    dryRun: true,
    pollIntervalSeconds: 120,
    minDiscountPct: 25,
    maxProductPrice: 800
  });
  await dashboardStore.createSearch(fallbackSearches[0], 100, paidUser.id);

  const snapshot = await dashboardStore.runtimeSnapshot(baseConfig, fallbackSearches, paidUser.id);
  assert.equal(snapshot.config.dryRun, true);
  assert.equal(snapshot.config.pollIntervalSeconds, 120);
  assert.equal(snapshot.scoringOptions.minDiscount, 0.25);
  results.push("user bot settings apply at runtime");

  const controller = new BotController(baseConfig, fallbackSearches, dealStore, dashboardStore);
  await controller.scanNow();

  assert.equal(providerState.calls, 1);
  assert.equal(discordState.posts, 1);
  assert.equal((await dashboardStore.listScanRuns(10, 1)).length, 1);
  assert.equal((await dashboardStore.listScanRuns(10, paidUser.id)).length, 1);
  assert.equal((await dashboardStore.listDealCandidates(10, paidUser.id)).length > 0, true);
  results.push("admin + paid user scan in one cycle with one provider call");
  results.push("paid dry-run user records deal without posting to Discord");

  const canceled = await postJson(`${apiOrigin}/api/internal/subscription-sync`, {
    discordId: "123456789012345678",
    active: false,
    plan: "monthly",
    eventType: "customer.subscription.deleted"
  }, { "x-bot-sync-secret": "local-smoke-sync-secret" });
  assert.equal(canceled.status, 200);
  assert.equal(canceled.body.user.plan, "free");
  assert.equal(canceled.body.user.dailyApifyQuota, 33);
  assert.equal(canceled.body.user.betaApproved, false);
  results.push("cancelled subscription downgrades bot user");

  const paidScansBefore = (await dashboardStore.listScanRuns(20, paidUser.id)).length;
  providerState.calls = 0;
  await controller.scanNow();
  assert.equal(providerState.calls, 1);
  assert.equal((await dashboardStore.listScanRuns(20, paidUser.id)).length, paidScansBefore);
  results.push("cancelled user no longer receives scans");

  console.log(JSON.stringify({
    ok: true,
    scenarios: results,
    providerCallsDuringSharedScan: 1,
    realDiscordPosts: discordState.posts,
    databasePath
  }, null, 2));
} finally {
  await close(apiServer);
  await close(providerServer);
  await close(discordServer);
  await dashboardStore?.close();
  await dealStore?.close();
  restoreEnv(previousEnv);
}

function config(overrides = {}) {
  return {
    providerType: "generic",
    authorizedDataApiUrl: "http://127.0.0.1/unset",
    authorizedDataApiKey: "smoke-provider-key",
    apifyActorId: "smoke-actor",
    discordWebhookUrl: "",
    pollIntervalSeconds: 900,
    providerTimeoutSeconds: 20,
    maxProductsPerScan: 100,
    heartbeatEveryScans: 0,
    databasePath: ":memory:",
    runOnStart: false,
    dryRun: false,
    ...overrides
  };
}

function phoneListing() {
  return {
    id: "smoke-iphone-15-pro-max-256",
    title: "iPhone 15 Pro Max 256Go",
    description: "Tres bon etat, facture, debloque tout operateur",
    price: { amount: "620", currency_code: "EUR" },
    url: "https://www.vinted.fr/items/smoke-iphone-15-pro-max-256",
    photos: [{ full_size_url: "https://example.test/iphone.jpg", is_main: true }],
    user: {
      login: "trusted-smoke-seller",
      feedback_reputation: "4.9",
      feedback_count: "52",
      item_count: "11",
      created_at: "2024-01-01T00:00:00Z",
      country_code: "FR"
    },
    itemCountry: "France",
    status: "Very good"
  };
}

async function listen(server) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function restoreEnv(env) {
  if (env.databaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = env.databaseUrl;
  if (env.botSyncSecret === undefined) delete process.env.BOT_SYNC_SECRET;
  else process.env.BOT_SYNC_SECRET = env.botSyncSecret;
  if (env.proQuota === undefined) delete process.env.PRO_DAILY_APIFY_QUOTA;
  else process.env.PRO_DAILY_APIFY_QUOTA = env.proQuota;
  if (env.freeQuota === undefined) delete process.env.FREE_DAILY_APIFY_QUOTA;
  else process.env.FREE_DAILY_APIFY_QUOTA = env.freeQuota;
  if (env.adminPassword === undefined) delete process.env.DASHBOARD_ADMIN_PASSWORD;
  else process.env.DASHBOARD_ADMIN_PASSWORD = env.adminPassword;
}
