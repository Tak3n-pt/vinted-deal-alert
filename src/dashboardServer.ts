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

const SESSION_COOKIE = "vinted_admin_session";
const SESSION_DAYS = 7;
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

  return (req, res) => {
    handleRequest(req, res, options, staticDir, loginAttempts).catch((error) => {
      const status = error instanceof HttpError ? error.status : 500;
      sendJson(res, status, { error: messageFromError(error) });
    });
  };
}

export async function startDashboardServer(port = Number(process.env.PORT ?? process.env.DASHBOARD_PORT ?? 3000)): Promise<Server> {
  const baseConfig = loadConfig();
  const fallbackSearches = loadSearches(baseConfig.maxProductsPerScan);
  const dealStore = await DealStore.open(baseConfig.databasePath);
  const dashboardStore = await DashboardStore.open(baseConfig.databasePath);
  await dashboardStore.ensureDefaults(fallbackSearches);
  const controller = new BotController(baseConfig, fallbackSearches, dealStore, dashboardStore);
  await controller.start();

  const adminPassword = process.env.DASHBOARD_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "admin";
  if (adminPassword === "admin") {
    console.warn("[dashboard] Using default admin password: admin. Set DASHBOARD_ADMIN_PASSWORD before deploying.");
  }

  const handler = createDashboardHandler({
    baseConfig,
    fallbackSearches,
    dashboardStore,
    controller,
    adminPassword,
    staticDir: resolve("dist/dashboard")
  });

  const server = createServer(handler);
  await new Promise<void>((resolveListen) => {
    server.listen(port, () => resolveListen());
  });
  console.log(`[dashboard] http://localhost:${port}`);
  return server;
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: DashboardHandlerOptions,
  staticDir: string,
  loginAttempts: Map<string, { count: number; resetAt: number }>
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    await handleApi(req, res, url, options, loginAttempts);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Method not allowed");
  await serveStatic(res, url.pathname, staticDir, req.method === "HEAD");
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  { baseConfig, fallbackSearches, dashboardStore, controller, adminPassword }: DashboardHandlerOptions,
  loginAttempts: Map<string, { count: number; resetAt: number }>
): Promise<void> {
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const loginKey = clientKey(req);
    if (isLoginLimited(loginAttempts, loginKey)) throw new HttpError(429, "Too many login attempts. Try again later.");
    const body = await readJson<{ password?: string }>(req);
    if (!safePasswordEquals(body.password ?? "", adminPassword)) {
      recordFailedLogin(loginAttempts, loginKey);
      throw new HttpError(401, "Invalid password");
    }
    loginAttempts.delete(loginKey);
    const token = randomBytes(32).toString("base64url");
    await dashboardStore.createSession(hashToken(token), sessionDate(new Date(Date.now() + SESSION_DAYS * 864e5)));
    res.setHeader("set-cookie", sessionCookie(`${SESSION_COOKIE}=${token}; Max-Age=${SESSION_DAYS * 86400}`));
    sendJson(res, 200, { authenticated: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    sendJson(res, 200, { authenticated: await authenticate(req, dashboardStore) });
    return;
  }

  const token = sessionToken(req);
  if (!token || !(await dashboardStore.validateSession(hashToken(token)))) {
    throw new HttpError(401, "Authentication required");
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
    const scan = await controller.scanNow();
    sendJson(res, 200, { status: await controller.status(), scan });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bot/pause") {
    sendJson(res, 200, { status: await controller.pause() });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/bot/resume") {
    sendJson(res, 200, { status: await controller.resume() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/settings") {
    sendJson(res, 200, { settings: await dashboardStore.settingsView(baseConfig) });
    return;
  }
  if (req.method === "PUT" && url.pathname === "/api/settings") {
    await dashboardStore.updateSettings(await readJson<DashboardSettingsInput>(req));
    sendJson(res, 200, { settings: await dashboardStore.settingsView(baseConfig) });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/settings/restore-defaults") {
    await dashboardStore.restoreDefaults(fallbackSearches);
    sendJson(res, 200, {
      settings: await dashboardStore.settingsView(baseConfig),
      searches: await dashboardStore.listSearches(),
      modelRules: await dashboardStore.listModelRules(),
      riskRules: await dashboardStore.getRiskRules()
    });
    return;
  }

  if (url.pathname === "/api/searches") {
    if (req.method === "GET") {
      sendJson(res, 200, { searches: await dashboardStore.listSearches() });
      return;
    }
    if (req.method === "POST") {
      sendJson(res, 201, { search: await dashboardStore.createSearch(await readJson(req)) });
      return;
    }
  }

  const searchId = routeId(url.pathname, "/api/searches/");
  if (searchId !== undefined) {
    if (req.method === "PUT") {
      sendJson(res, 200, { search: await dashboardStore.updateSearch(searchId, await readJson(req)) });
      return;
    }
    if (req.method === "DELETE") {
      await dashboardStore.deleteSearch(searchId);
      sendJson(res, 200, { ok: true });
      return;
    }
  }

  if (req.method === "GET" && url.pathname === "/api/model-rules") {
    sendJson(res, 200, { modelRules: await dashboardStore.listModelRules() });
    return;
  }
  if (req.method === "PUT" && url.pathname === "/api/model-rules") {
    const body = await readJson<{ modelRules?: unknown } | unknown[]>(req);
    const modelRules = Array.isArray(body) ? body : body.modelRules;
    if (!Array.isArray(modelRules)) throw new HttpError(400, "modelRules must be an array");
    sendJson(res, 200, { modelRules: await dashboardStore.replaceModelRules(modelRules as ModelRule[]) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/risk-rules") {
    sendJson(res, 200, { riskRules: await dashboardStore.getRiskRules() });
    return;
  }
  if (req.method === "PUT" && url.pathname === "/api/risk-rules") {
    sendJson(res, 200, { riskRules: await dashboardStore.updateRiskRules(await readJson(req)) });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/deals") {
    sendJson(res, 200, { deals: await dashboardStore.listDealCandidates(limitFromUrl(url, 100)) });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/scans") {
    sendJson(res, 200, { scans: await dashboardStore.listScanRuns(limitFromUrl(url, 50)) });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/logs") {
    sendJson(res, 200, { logs: await dashboardStore.listLogs(limitFromUrl(url, 100)) });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/discord/test") {
    await controller.testDiscord();
    sendJson(res, 200, { ok: true });
    return;
  }

  throw new HttpError(404, "Route not found");
}

async function serveStatic(res: ServerResponse, pathname: string, staticDir: string, headOnly: boolean): Promise<void> {
  const decoded = decodeURIComponent(pathname);
  const candidate = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const filePath = resolve(staticDir, candidate);
  const safeRelative = relative(staticDir, filePath);
  if (safeRelative.startsWith("..") || safeRelative === "") {
    throw new HttpError(403, "Forbidden");
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, { "content-type": mimeType(filePath), "cache-control": cacheHeader(filePath) });
    if (!headOnly) res.end(content);
    else res.end();
  } catch {
    if (extname(candidate)) throw new HttpError(404, "File not found");
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

async function authenticate(req: IncomingMessage, store: DashboardStore): Promise<boolean> {
  const token = sessionToken(req);
  return Boolean(token && (await store.validateSession(hashToken(token))));
}

function sessionToken(req: IncomingMessage): string | undefined {
  const cookies = req.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator === -1) continue;
    const key = cookie.slice(0, separator).trim();
    const value = cookie.slice(separator + 1).trim();
    if (key === SESSION_COOKIE) return value;
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
  if (extension === ".webp") return "image/webp";
  return "application/octet-stream";
}

function cacheHeader(filePath: string): string {
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
