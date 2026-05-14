import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadConfig, loadSearches } from "./config.js";
import { DealStore } from "./store.js";
import { DashboardStore } from "./dashboardStore.js";
import { BotController, type BotStatus } from "./botController.js";
import type { RuntimeConfig, SearchConfig } from "./types.js";
import type { DashboardSettingsInput, ModelRule } from "./dashboardTypes.js";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchDiscordProfile,
  generateOAuthState,
  isBetaAllowed,
  loadDiscordOAuthConfig
} from "./discordOAuth.js";

const SESSION_COOKIE = "vinted_admin_session";
const OAUTH_STATE_COOKIE = "vinted_oauth_state";
const SESSION_DAYS = 7;
const OAUTH_STATE_TTL_SEC = 600;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;

export interface DashboardHandlerOptions {
  baseConfig: RuntimeConfig;
  fallbackSearches: SearchConfig[];
  dashboardStore: DashboardStore;
  controller: DashboardControllerApi;
  adminPassword: string;
  staticDir: string;
}

export interface DashboardControllerApi {
  status(): Promise<BotStatus> | BotStatus;
  scanNow(): Promise<unknown>;
  pause(): Promise<BotStatus> | BotStatus;
  resume(): Promise<BotStatus> | BotStatus;
  testDiscord(): Promise<void>;
}

export function createDashboardHandler(options: DashboardHandlerOptions): (req: IncomingMessage, res: ServerResponse) => void {
  const staticDir = resolve(options.staticDir);
  const loginAttempts = new Map<string, { count: number; resetAt: number }>();
  const writeAttempts = new Map<string, { count: number; resetAt: number }>();

  return (req, res) => {
    applySecurityHeaders(res);
    handleRequest(req, res, options, staticDir, loginAttempts, writeAttempts).catch((error) => {
      const status = error instanceof HttpError ? error.status : 500;
      sendJson(res, status, { error: messageFromError(error) });
    });
  };
}

function applySecurityHeaders(res: ServerResponse): void {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("permissions-policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader(
    "content-security-policy",
    "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com; frame-ancestors 'none'"
  );
}

export async function startDashboardServer(port = Number(process.env.PORT ?? process.env.DASHBOARD_PORT ?? 3000)): Promise<Server> {
  const baseConfig = loadConfig();
  const fallbackSearches = loadSearches(baseConfig.maxProductsPerScan);
  const dealStore = await DealStore.open(baseConfig.databasePath);
  const dashboardStore = await DashboardStore.open(baseConfig.databasePath);
  await dashboardStore.ensureDefaults(fallbackSearches);
  const controller = new BotController(baseConfig, fallbackSearches, dealStore, dashboardStore);
  await controller.start();

  const adminPassword = process.env.DASHBOARD_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "";
  const isProduction = process.env.NODE_ENV === "production";
  if (!adminPassword) {
    if (isProduction) {
      throw new Error("DASHBOARD_ADMIN_PASSWORD est requis en production. Définir une valeur forte avant le démarrage.");
    }
    console.warn("[dashboard] Aucun DASHBOARD_ADMIN_PASSWORD défini. Mot de passe 'admin' utilisé pour le dev local uniquement.");
  } else if (adminPassword === "admin") {
    if (isProduction) {
      throw new Error("DASHBOARD_ADMIN_PASSWORD=admin est interdit en production. Choisir un mot de passe fort.");
    }
    console.warn("[dashboard] Mot de passe admin trivial 'admin' détecté. Réservé au dev local.");
  } else if (adminPassword.length < 12) {
    console.warn("[dashboard] DASHBOARD_ADMIN_PASSWORD plus court que 12 caractères. Préférer une phrase de passe plus longue.");
  }

  const handler = createDashboardHandler({
    baseConfig,
    fallbackSearches,
    dashboardStore,
    controller,
    adminPassword: adminPassword || "admin",
    staticDir: resolve("dist/dashboard")
  });

  // Default to loopback so the dashboard isn't exposed on every interface.
  // Operators must opt in via DASHBOARD_HOST=0.0.0.0 (or a specific IP) to
  // expose the port; production deployments are expected to terminate at a
  // reverse proxy / Cloudflare Access in front.
  const host = process.env.DASHBOARD_HOST ?? (isProduction ? "0.0.0.0" : "127.0.0.1");

  const server = createServer(handler);
  await new Promise<void>((resolveListen) => {
    server.listen(port, host, () => resolveListen());
  });
  console.log(`[dashboard] http://${host === "0.0.0.0" ? "localhost" : host}:${port}`);
  return server;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: DashboardHandlerOptions,
  staticDir: string,
  loginAttempts: Map<string, { count: number; resetAt: number }>,
  writeAttempts: Map<string, { count: number; resetAt: number }>
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url, options, loginAttempts, writeAttempts);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Méthode non autorisée");
  await serveStatic(res, url.pathname, staticDir, req.method === "HEAD");
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  { baseConfig, fallbackSearches, dashboardStore, controller, adminPassword }: DashboardHandlerOptions,
  loginAttempts: Map<string, { count: number; resetAt: number }>,
  writeAttempts: Map<string, { count: number; resetAt: number }>
): Promise<void> {
  // Legacy password login. Tied to user_id = 1 (the seed admin). Gated behind
  // LEGACY_PASSWORD_LOGIN=1 in production so OAuth becomes the only entry point
  // once the team rolls out Discord auth. Always available in non-production
  // (NODE_ENV !== "production") for emergency operator access.
  const legacyPasswordEnabled = process.env.NODE_ENV !== "production" || process.env.LEGACY_PASSWORD_LOGIN === "1";
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    if (!legacyPasswordEnabled) throw new HttpError(410, "Connexion par mot de passe désactivée. Utiliser Discord.");
    const loginKey = clientKey(req);
    if (isLoginLimited(loginAttempts, loginKey)) throw new HttpError(429, "Trop de tentatives de connexion. Réessayer plus tard.");
    const body = await readJson<{ password?: string }>(req);
    if (!safePasswordEquals(body.password ?? "", adminPassword)) {
      recordFailedLogin(loginAttempts, loginKey);
      throw new HttpError(401, "Mot de passe invalide");
    }
    loginAttempts.delete(loginKey);
    const token = randomBytes(32).toString("base64url");
    await dashboardStore.createSession(
      hashToken(token),
      sessionDate(new Date(Date.now() + SESSION_DAYS * 864e5)),
      1 /* seed admin */
    );
    res.setHeader("set-cookie", sessionCookie(`${SESSION_COOKIE}=${token}; Max-Age=${SESSION_DAYS * 86400}`));
    sendJson(res, 200, { authenticated: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/discord/start") {
    const oauthConfig = loadDiscordOAuthConfig();
    if (!oauthConfig) throw new HttpError(503, "Discord OAuth non configuré sur ce serveur.");
    const state = generateOAuthState();
    const cookies = [stateCookie(`${OAUTH_STATE_COOKIE}=${state}; Max-Age=${OAUTH_STATE_TTL_SEC}`)];
    res.setHeader("set-cookie", cookies);
    sendRedirect(res, buildAuthorizeUrl(oauthConfig, state));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/discord/callback") {
    const oauthConfig = loadDiscordOAuthConfig();
    if (!oauthConfig) throw new HttpError(503, "Discord OAuth non configuré sur ce serveur.");
    const code = url.searchParams.get("code") ?? "";
    const state = url.searchParams.get("state") ?? "";
    const cookieState = readCookie(req, OAUTH_STATE_COOKIE);
    // Clear the state cookie regardless of outcome
    const clearState = stateCookie(`${OAUTH_STATE_COOKIE}=; Max-Age=0`);
    if (!code) {
      res.setHeader("set-cookie", clearState);
      throw new HttpError(400, "Code OAuth manquant");
    }
    if (!state || !cookieState || state !== cookieState) {
      res.setHeader("set-cookie", clearState);
      throw new HttpError(400, "État OAuth invalide (CSRF)");
    }
    const accessToken = await exchangeCodeForToken(oauthConfig, code);
    const profile = await fetchDiscordProfile(accessToken);
    const user = await dashboardStore.upsertUserFromDiscord(profile);
    if (user.plan !== "admin" && !isBetaAllowed(user.discordId)) {
      res.setHeader("set-cookie", clearState);
      sendRedirect(res, "/?beta=denied");
      return;
    }
    // Flip beta_approved=1 once the gate has been crossed so the bot loop
    // (`listActiveUsers`) actually scans for this user. Admins skip the
    // beta gate but their seed row already has beta_approved=1.
    if (!user.betaApproved && user.plan !== "admin") {
      await dashboardStore.setUserBetaApproved(user.id, true);
    }
    const token = randomBytes(32).toString("base64url");
    await dashboardStore.createSession(
      hashToken(token),
      sessionDate(new Date(Date.now() + SESSION_DAYS * 864e5)),
      user.id
    );
    res.setHeader("set-cookie", [
      clearState,
      sessionCookie(`${SESSION_COOKIE}=${token}; Max-Age=${SESSION_DAYS * 86400}`)
    ]);
    sendRedirect(res, "/");
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const token = sessionToken(req);
    const userId = token ? await dashboardStore.getSessionUser(hashToken(token)) : null;
    if (!userId) {
      sendJson(res, 200, { authenticated: false });
      return;
    }
    const user = await dashboardStore.getUserById(userId);
    if (!user) {
      sendJson(res, 200, { authenticated: false });
      return;
    }
    sendJson(res, 200, {
      authenticated: true,
      user: {
        id: user.id,
        discordId: user.discordId,
        username: user.discordUsername,
        avatar: user.discordAvatar,
        plan: user.plan
      }
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/public/dashboard") {
    const userId = 1;
    const [status, deals, scans, logs, searches] = await Promise.all([
      controller.status(),
      dashboardStore.listDealCandidates(limitFromUrl(url, 100), userId),
      dashboardStore.listScanRuns(limitFromUrl(url, 100), userId),
      dashboardStore.listLogs(limitFromUrl(url, 100), userId),
      dashboardStore.listSearches(userId)
    ]);
    const activeSearches = searches.filter((search) => search.enabled);
    sendJson(res, 200, {
      generatedAt: new Date().toISOString(),
      status,
      deals,
      scans,
      logs,
      activeSearchCount: activeSearches.length,
      searchesTotal: searches.length,
      searches: activeSearches.map((search) => ({
        id: search.id,
        enabled: search.enabled,
        market: search.market,
        limit: search.limit,
        sort: search.sort
      }))
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/healthz") {
    sendJson(res, 200, { ok: true });
    return;
  }

  const token = sessionToken(req);
  const userId = token ? await dashboardStore.getSessionUser(hashToken(token)) : null;
  if (!token || !userId) {
    throw new HttpError(401, "Authentification requise");
  }
  const sessionUser = await dashboardStore.getUserById(userId);
  if (!sessionUser) throw new HttpError(401, "Utilisateur introuvable");
  const isAdmin = sessionUser.plan === "admin";
  const requireAdmin = () => {
    if (!isAdmin) throw new HttpError(403, "Réservé à l'administrateur");
  };

  // Per-session write rate-limit. We key on the session token so an attacker
  // can't drain the limiter for a legit user from the same NAT or by spoofing
  // x-forwarded-for. Login is excluded (it has its own limiter); reads are
  // unrestricted.
  const isMutation = req.method === "POST" || req.method === "PUT" || req.method === "DELETE" || req.method === "PATCH";
  if (isMutation && recordWriteAttempt(writeAttempts, hashToken(token))) {
    throw new HttpError(429, "Trop de modifications consécutives. Réessayer dans quelques secondes.");
  }

  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    await dashboardStore.deleteSession(hashToken(token));
    res.setHeader("set-cookie", sessionCookie(`${SESSION_COOKIE}=; Max-Age=0`));
    sendJson(res, 200, { authenticated: false });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/status") {
    sendJson(res, 200, { status: await controller.status() });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bot/scan-now") {
    requireAdmin();
    const scan = await controller.scanNow();
    sendJson(res, 200, { status: await controller.status(), scan });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bot/pause") {
    requireAdmin();
    sendJson(res, 200, { status: await controller.pause() });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bot/resume") {
    requireAdmin();
    sendJson(res, 200, { status: await controller.resume() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/settings") {
    sendJson(res, 200, { settings: await dashboardStore.settingsView(baseConfig) });
    return;
  }
  if (req.method === "PUT" && url.pathname === "/api/settings") {
    requireAdmin();
    await dashboardStore.updateSettings(await readJson<DashboardSettingsInput>(req));
    sendJson(res, 200, { settings: await dashboardStore.settingsView(baseConfig) });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/settings/restore-defaults") {
    await dashboardStore.restoreDefaults(fallbackSearches, userId);
    sendJson(res, 200, {
      settings: await dashboardStore.settingsView(baseConfig),
      searches: await dashboardStore.listSearches(userId),
      modelRules: await dashboardStore.listModelRules(userId),
      riskRules: await dashboardStore.getRiskRules(userId)
    });
    return;
  }

  if (url.pathname === "/api/searches") {
    if (req.method === "GET") {
      sendJson(res, 200, { searches: await dashboardStore.listSearches(userId) });
      return;
    }
    if (req.method === "POST") {
      sendJson(res, 201, {
        search: await dashboardStore.createSearch(await readJson(req), baseConfig.maxProductsPerScan, userId)
      });
      return;
    }
  }

  const searchId = routeId(url.pathname, "/api/searches/");
  if (searchId !== undefined) {
    if (req.method === "PUT") {
      sendJson(res, 200, {
        search: await dashboardStore.updateSearch(searchId, await readJson(req), baseConfig.maxProductsPerScan, userId)
      });
      return;
    }
    if (req.method === "DELETE") {
      await dashboardStore.deleteSearch(searchId, userId);
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  if (req.method === "GET" && url.pathname === "/api/model-rules") {
    sendJson(res, 200, { modelRules: await dashboardStore.listModelRules(userId) });
    return;
  }
  if (req.method === "PUT" && url.pathname === "/api/model-rules") {
    const body = await readJson<{ modelRules?: unknown } | unknown[]>(req);
    const modelRules = Array.isArray(body) ? body : body.modelRules;
    if (!Array.isArray(modelRules)) throw new HttpError(400, "modelRules doit être un tableau");
    sendJson(res, 200, { modelRules: await dashboardStore.replaceModelRules(modelRules as ModelRule[], userId) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/risk-rules") {
    sendJson(res, 200, { riskRules: await dashboardStore.getRiskRules(userId) });
    return;
  }
  if (req.method === "PUT" && url.pathname === "/api/risk-rules") {
    sendJson(res, 200, { riskRules: await dashboardStore.updateRiskRules(await readJson(req), userId) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/deals") {
    sendJson(res, 200, { deals: await dashboardStore.listDealCandidates(limitFromUrl(url, 100), userId) });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/scans") {
    sendJson(res, 200, { scans: await dashboardStore.listScanRuns(limitFromUrl(url, 50), userId) });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/logs") {
    sendJson(res, 200, { logs: await dashboardStore.listLogs(limitFromUrl(url, 100), userId) });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/analytics") {
    const range = Math.max(1, Math.min(365, Number(url.searchParams.get("range") ?? 30) || 30));
    sendJson(res, 200, { analytics: await dashboardStore.getAnalytics(userId, range) });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/discord/test") {
    requireAdmin();
    await controller.testDiscord();
    sendJson(res, 200, { ok: true });
    return;
  }

  // --- Per-user routes ---
  if (req.method === "GET" && url.pathname === "/api/user/settings") {
    sendJson(res, 200, { settings: await dashboardStore.getUserSettings(userId) });
    return;
  }
  if (req.method === "PUT" && url.pathname === "/api/user/settings") {
    const body = await readJson<{
      discordWebhookUrl?: string | null;
      dryRun?: boolean;
      pollIntervalSeconds?: number;
      minDiscountPct?: number | null;
      maxProductPrice?: number | null;
    }>(req);
    if (body.discordWebhookUrl !== undefined) {
      await dashboardStore.setUserDiscordWebhook(userId, body.discordWebhookUrl);
    }
    const settings = await dashboardStore.updateUserSettings(userId, body);
    sendJson(res, 200, { settings });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/user/webhook/test") {
    const webhook = await dashboardStore.getDecryptedWebhook(userId);
    if (!webhook) throw new HttpError(400, "Aucun webhook configuré");
    let probeResponse: Response;
    try {
      probeResponse = await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: "Bonoitec Flash",
          content: ":satellite: Test webhook — votre dashboard Bonoitec est bien connecté à Discord."
        }),
        // Hard 5s ceiling — Discord normally responds in <200ms; anything past
        // this is almost always a wrong URL or a transient network issue.
        signal: AbortSignal.timeout(5000)
      });
    } catch (error) {
      const message = error instanceof Error && error.name === "TimeoutError"
        ? "Discord n'a pas répondu en 5 s — vérifier l'URL du webhook"
        : `Réseau : ${error instanceof Error ? error.message : String(error)}`;
      throw new HttpError(502, message);
    }
    if (!probeResponse.ok) {
      const detail = await probeResponse.text().catch(() => "");
      throw new HttpError(
        502,
        `Discord a refusé le webhook (${probeResponse.status}). ${detail.slice(0, 200)}`
      );
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  throw new HttpError(404, "Route introuvable");
}

async function serveStatic(res: ServerResponse, pathname: string, staticDir: string, headOnly: boolean): Promise<void> {
  const decoded = decodeURIComponent(pathname);
  const candidate = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const filePath = resolve(staticDir, candidate);
  const safeRelative = relative(staticDir, filePath);
  if (safeRelative.startsWith("..") || safeRelative === "") {
    throw new HttpError(403, "Accès interdit");
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "content-type": mimeType(filePath), "cache-control": cacheHeader(filePath) });
    if (!headOnly) res.end(content);
    else res.end();
  } catch {
    if (extname(candidate)) throw new HttpError(404, "Fichier introuvable");
    const index = await readFile(resolve(staticDir, "index.html"));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
    if (!headOnly) res.end(index);
    else res.end();
  }
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new HttpError(413, "Body too large");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {} as T;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function sendRedirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { location, "cache-control": "no-store" });
  res.end();
}

function sessionToken(req: IncomingMessage): string | undefined {
  return readCookie(req, SESSION_COOKIE);
}

function readCookie(req: IncomingMessage, name: string): string | undefined {
  const cookies = req.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator === -1) continue;
    const key = cookie.slice(0, separator).trim();
    const value = cookie.slice(separator + 1).trim();
    if (key === name) return value;
  }
  return undefined;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sessionCookie(value: string): string {
  const secure = process.env.DASHBOARD_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
  return `${value}; HttpOnly; SameSite=Lax; Path=/${secure ? "; Secure" : ""}`;
}

function stateCookie(value: string): string {
  // Short-lived (10 min), HttpOnly, SameSite=Lax so it survives the Discord
  // redirect roundtrip. Path=/api/auth keeps it scoped to the OAuth dance.
  const secure = process.env.DASHBOARD_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production";
  return `${value}; HttpOnly; SameSite=Lax; Path=/api/auth${secure ? "; Secure" : ""}`;
}

function safePasswordEquals(input: string, expected: string): boolean {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  if (inputBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(inputBuffer, expectedBuffer);
}

function clientKey(req: IncomingMessage): string {
  const forwardedFor = req.headers["x-forwarded-for"];
  const firstForwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return (firstForwarded?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown").slice(0, 128);
}

function isLoginLimited(attempts: Map<string, { count: number; resetAt: number }>, key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (entry.resetAt <= Date.now()) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordFailedLogin(attempts: Map<string, { count: number; resetAt: number }>, key: string): void {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  current.count += 1;
  attempts.set(key, current);
}

const WRITE_WINDOW_MS = 10 * 1000;
const WRITE_MAX_PER_WINDOW = 30;

function recordWriteAttempt(attempts: Map<string, { count: number; resetAt: number }>, key: string): boolean {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 1, resetAt: now + WRITE_WINDOW_MS });
    return false;
  }
  current.count += 1;
  attempts.set(key, current);
  return current.count > WRITE_MAX_PER_WINDOW;
}

function routeId(pathname: string, prefix: string): number | undefined {
  if (!pathname.startsWith(prefix)) return undefined;
  const value = Number(pathname.slice(prefix.length));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function limitFromUrl(url: URL, fallback: number): number {
  const value = Number(url.searchParams.get("limit") ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(300, Math.max(1, Math.floor(value)));
}

function sessionDate(date: Date): string {
  return date.toISOString();
}

function mimeType(filePath: string): string {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".woff2") return "font/woff2";
  if (extension === ".woff") return "font/woff";
  if (extension === ".ttf") return "font/ttf";
  if (extension === ".eot") return "application/vnd.ms-fontobject";
  return "application/octet-stream";
}

function cacheHeader(filePath: string): string {
  if (filePath.endsWith("bot-data.js")) return "no-cache";
  return filePath.includes("/assets/") || filePath.includes("\\assets\\") ? "public, max-age=31536000, immutable" : "no-cache";
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

let runningServer: Server | undefined;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startDashboardServer()
    .then((server) => {
      runningServer = server;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.stack : error);
      process.exitCode = 1;
    });
}
