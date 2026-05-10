import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createDashboardHandler, type DashboardControllerApi } from "../src/dashboardServer.js";
import { DashboardStore } from "../src/dashboardStore.js";
import type { RuntimeConfig, SearchConfig } from "../src/types.js";

test("dashboard API refuses protected routes without a session", async () => {
  const fixture = await dashboardFixture();
  try {
    const response = await fetch(`${fixture.origin}/api/status`);
    assert.equal(response.status, 401);
  } finally {
    await fixture.close();
  }
});

test("dashboard login, session, logout, and write-only secrets work", async () => {
  const fixture = await dashboardFixture();
  try {
    const badLogin = await fetch(`${fixture.origin}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "wrong" })
    });
    assert.equal(badLogin.status, 401);

    const login = await fetch(`${fixture.origin}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "secret" })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    assert.ok(cookie);

    const hiddenWebhook = "https://discord.com/api/webhooks/secret-value";
    const update = await fetch(`${fixture.origin}/api/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        dryRun: true,
        minScore: 90,
        discordWebhookUrl: hiddenWebhook
      })
    });
    const updateText = await update.text();
    assert.equal(update.status, 200, updateText);
    assert.equal(updateText.includes(hiddenWebhook), false);
    const updateJson = JSON.parse(updateText) as { settings: { dryRun: boolean; minScore: number; discordWebhookConfigured: boolean } };
    assert.equal(updateJson.settings.dryRun, true);
    assert.equal(updateJson.settings.minScore, 90);
    assert.equal(updateJson.settings.discordWebhookConfigured, true);

    const settings = await jsonFetch<{ settings: Record<string, unknown> }>(`${fixture.origin}/api/settings`, { cookie });
    assert.equal(JSON.stringify(settings).includes(hiddenWebhook), false);
    assert.equal(settings.settings.discordWebhookConfigured, true);

    const logout = await fetch(`${fixture.origin}/api/auth/logout`, { method: "POST", headers: { cookie } });
    assert.equal(logout.status, 200);
    const denied = await fetch(`${fixture.origin}/api/status`, { headers: { cookie } });
    assert.equal(denied.status, 401);
  } finally {
    await fixture.close();
  }
});

test("dashboard searches and rules persist in sqlite", async () => {
  const fixture = await dashboardFixture();
  try {
    const cookie = await loginCookie(fixture.origin);
    const created = await jsonFetch<{ search: { id: number; query: string } }>(`${fixture.origin}/api/searches`, {
      cookie,
      method: "POST",
      body: { query: "iphone 16 pro 256go", limit: 10, enabled: false }
    });
    assert.equal(created.search.query, "iphone 16 pro 256go");

    const searches = await jsonFetch<{ searches: Array<{ id: number; enabled: boolean }> }>(`${fixture.origin}/api/searches`, { cookie });
    const saved = searches.searches.find((search) => search.id === created.search.id);
    assert.equal(saved?.enabled, false);
    assert.equal((await fixture.store.activeSearches()).some((search) => search.query === "iphone 16 pro 256go"), false);

    const modelRules = await jsonFetch<{ modelRules: Array<{ model: string; enabled: boolean }> }>(`${fixture.origin}/api/model-rules`, {
      cookie,
      method: "PUT",
      body: {
        modelRules: [{
          model: "iPhone 15 Pro Max",
          enabled: false,
          storagesGb: [256],
          maxFinalPrice: 700
        }]
      }
    });
    assert.equal(modelRules.modelRules[0]?.enabled, false);

    const riskRules = await jsonFetch<{ riskRules: { rejectMissingInvoice: boolean; minSellerReviews: number } }>(
      `${fixture.origin}/api/risk-rules`,
      {
        cookie,
        method: "PUT",
        body: { rejectMissingInvoice: true, minSellerReviews: 5 }
      }
    );
    assert.equal(riskRules.riskRules.rejectMissingInvoice, true);
    assert.equal(riskRules.riskRules.minSellerReviews, 5);
  } finally {
    await fixture.close();
  }
});

test("dashboard accepts a zero minimum score without breaking settings reads", async () => {
  const fixture = await dashboardFixture();
  try {
    const cookie = await loginCookie(fixture.origin);
    const updated = await jsonFetch<{ settings: { minScore: number } }>(`${fixture.origin}/api/settings`, {
      cookie,
      method: "PUT",
      body: { minScore: 0 }
    });
    assert.equal(updated.settings.minScore, 0);

    const settings = await jsonFetch<{ settings: { minScore: number } }>(`${fixture.origin}/api/settings`, { cookie });
    assert.equal(settings.settings.minScore, 0);
  } finally {
    await fixture.close();
  }
});

test("dashboard marks session cookies secure in production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSecure = process.env.DASHBOARD_COOKIE_SECURE;
  process.env.NODE_ENV = "production";
  delete process.env.DASHBOARD_COOKIE_SECURE;

  const fixture = await dashboardFixture();
  try {
    const login = await fetch(`${fixture.origin}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "secret" })
    });
    const cookie = login.headers.get("set-cookie") ?? "";
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
  } finally {
    await fixture.close();
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousSecure === undefined) delete process.env.DASHBOARD_COOKIE_SECURE;
    else process.env.DASHBOARD_COOKIE_SECURE = previousSecure;
  }
});

test("dashboard refuses a search whose limit blows the per-scan budget", async () => {
  const fixture = await dashboardFixture();
  try {
    const cookie = await loginCookie(fixture.origin);
    // Lower the cap so we can exercise the budget gate without a giant search.
    await fetch(`${fixture.origin}/api/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ maxProductsPerScan: 50 })
    });
    // The fixture seeds 1 default search of 10 → adding 41 more would put us at 51, over the cap.
    const response = await fetch(`${fixture.origin}/api/searches`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ query: "iphone 17 pro 256go", limit: 41, enabled: true })
    });
    assert.equal(response.status, 500); // dashboardServer wraps non-Http errors as 500
    const text = await response.text();
    assert.match(text, /Budget dépassé/);
  } finally {
    await fixture.close();
  }
});

test("dashboard pruneRetention caps deal_candidates and dashboard_logs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vinted-retention-"));
  const databasePath = join(dir, "deals.sqlite");
  const store = await DashboardStore.open(databasePath);
  try {
    for (let i = 0; i < 250; i += 1) await store.log("info", `event ${i}`);
    const beforeLogs = await store.listLogs(300);
    assert.equal(beforeLogs.length >= 250, true);

    await store.pruneRetention({ dealCandidatesKeep: 100, logsKeep: 120, scanRunsKeep: 100 });

    const afterLogs = await store.listLogs(300);
    // pruneRetention enforces a minimum of 100; 120 means at most 120 rows remain.
    assert.equal(afterLogs.length <= 120, true, `expected ≤120, got ${afterLogs.length}`);
    assert.equal(afterLogs.length >= 100, true);
  } finally {
    await store.close();
  }
});

test("dashboard rate limits repeated failed logins", async () => {
  const fixture = await dashboardFixture();
  try {
    let status = 0;
    for (let attempt = 0; attempt < 9; attempt += 1) {
      const response = await fetch(`${fixture.origin}/api/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.50" },
        body: JSON.stringify({ password: "wrong" })
      });
      status = response.status;
    }

    assert.equal(status, 429);
  } finally {
    await fixture.close();
  }
});

async function dashboardFixture(): Promise<{
  origin: string;
  store: DashboardStore;
  close: () => Promise<void>;
}> {
  const dir = mkdtempSync(join(tmpdir(), "vinted-dashboard-"));
  const databasePath = join(dir, "deals.sqlite");
  const staticDir = join(dir, "static");
  writeFileSync(join(dir, "index-placeholder"), "");
  const baseConfig = config(databasePath);
  const fallbackSearches: SearchConfig[] = [{ market: "FR", query: "iphone 15 pro 256go", limit: 10, sort: "newest" }];
  const store = await DashboardStore.open(databasePath);
  await store.ensureDefaults(fallbackSearches);
  const controller: DashboardControllerApi = {
    status: () => ({ running: true, paused: false, scanInFlight: false }),
    scanNow: async () => undefined,
    pause: () => ({ running: false, paused: true, scanInFlight: false }),
    resume: () => ({ running: true, paused: false, scanInFlight: false }),
    testDiscord: async () => undefined
  };
  const server = createServer(createDashboardHandler({
    baseConfig,
    fallbackSearches,
    dashboardStore: store,
    controller,
    adminPassword: "secret",
    staticDir
  }));
  await listen(server);
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    store,
    close: () => close(server)
  };
}

function config(databasePath: string): RuntimeConfig {
  return {
    providerType: "generic",
    authorizedDataApiUrl: "",
    authorizedDataApiKey: "generic-secret",
    apifyActorId: "actor",
    discordWebhookUrl: "",
    pollIntervalSeconds: 900,
    providerTimeoutSeconds: 20,
    maxProductsPerScan: 100,
    heartbeatEveryScans: 0,
    databasePath,
    runOnStart: false,
    dryRun: true
  };
}

async function loginCookie(origin: string): Promise<string> {
  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "secret" })
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert.ok(cookie);
  return cookie;
}

async function jsonFetch<T>(url: string, options: { cookie?: string; method?: string; body?: unknown } = {}): Promise<T> {
  const init: RequestInit = {
    method: options.method ?? "GET",
    headers: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.body ? { "content-type": "application/json" } : {})
    }
  };
  if (options.body) init.body = JSON.stringify(options.body);
  const response = await fetch(url, init);
  const text = await response.text();
  assert.equal(response.ok, true, text);
  return JSON.parse(text) as T;
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
