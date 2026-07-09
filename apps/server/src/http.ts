#!/usr/bin/env node
/**
 * @mss/server — Hardened HTTP Server Entry Point
 * MCP Super-Server HTTP API with production security controls
 * 
 * Security Controls:
 * - C-001: Bearer token authentication (env: MCP_API_SECRET)
 * - C-002: Restricted CORS (env: MCP_ALLOWED_ORIGINS)
 * - C-003: Rate limiting per IP
 * - H-001: Input validation (body size, content-type)
 * - H-002: Security headers
 * - H-003: Sanitized error responses
 * 
 * Monitoring:
 * - Prometheus metrics at /metrics
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile, appendFile, access, constants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MCPSuperServer, createMCPServer } from "./server.js";
import { createMetricsRegistry, Timer } from "./metrics/index.js";

// ─── Configuration ─────────────────────────────────────────────────────────────

const rawPort = process.env.PORT || "3000";
const PORT = parseInt(rawPort, 10);
if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
  console.error(`Invalid PORT: ${rawPort}`);
  process.exit(1);
}

const API_SECRET = process.env.MCP_API_SECRET;
const ALLOWED_ORIGINS = (process.env.MCP_ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Rate limiting config
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.MCP_RATE_LIMIT || "100", 10);

// Request limits
const MAX_BODY_SIZE = parseInt(process.env.MCP_MAX_BODY_SIZE || "1048576", 10); // 1MB default

// Agent Inbox data path (relative to repo root)
const __filename = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(__filename), "../../..");
const INBOX_FILE = path.resolve(
  PROJECT_ROOT,
  "founder-command-center",
  "staging_data",
  "signals",
  "signals.jsonl"
);

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

interface InboxSignal {
  id: string;
  schema_version?: string;
  created_at: string;
  updated_at?: string;
  source_type: string;
  source_ref?: string | undefined;
  title: string;
  body: string;
  priority: string;
  confidence?: number;
  status?: string;
  signal_type?: string;
  correlation_id?: string;
}

async function ensureInboxFile(): Promise<void> {
  try {
    await access(INBOX_FILE, constants.F_OK);
  } catch {
    // File does not exist; create an empty file
    await appendFile(INBOX_FILE, "", "utf8");
  }
}

async function loadSignals(): Promise<InboxSignal[]> {
  await ensureInboxFile();
  const raw = await readFile(INBOX_FILE, "utf8");
  const signals: InboxSignal[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      signals.push(JSON.parse(line) as InboxSignal);
    } catch {
      // skip malformed lines
    }
  }
  return signals;
}

function sortSignals(signals: InboxSignal[]): InboxSignal[] {
  return signals.slice().sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 99;
    const pb = PRIORITY_ORDER[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function generateSignalId(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const r = Math.floor(Math.random() * 1000).toString().padStart(3, "0");
  return `sig_${y}_${m}_${d}_${r}`;
}

async function saveSignal(signal: InboxSignal): Promise<void> {
  await ensureInboxFile();
  await appendFile(INBOX_FILE, JSON.stringify(signal) + "\n", "utf8");
}

function renderInboxHTML(signals: InboxSignal[]): string {
  const items = signals
    .map((s) => {
      const badgeColor =
        s.priority === "critical"
          ? "bg-red-100 text-red-800"
          : s.priority === "high"
          ? "bg-orange-100 text-orange-800"
          : s.priority === "medium"
          ? "bg-yellow-100 text-yellow-800"
          : "bg-green-100 text-green-800";
      return `
        <article class="p-4 mb-4 bg-white rounded shadow border border-gray-200">
          <div class="flex items-center justify-between mb-2">
            <h2 class="text-lg font-semibold text-gray-900">${escapeHtml(s.title)}</h2>
            <span class="px-2 py-1 text-xs font-bold rounded ${badgeColor} uppercase">${s.priority}</span>
          </div>
          <p class="text-gray-700">${escapeHtml(s.body)}</p>
          <div class="mt-3 text-sm text-gray-500 flex gap-4">
            <span>Source: ${escapeHtml(s.source_type)}</span>
            <span>Signal type: ${escapeHtml(s.signal_type || "inbox")}</span>
            <span>Confidence: ${s.confidence ?? "-"}</span>
            <span>${new Date(s.created_at).toLocaleString()}</span>
          </div>
        </article>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agent Inbox — MCP Super-Server</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 min-h-screen p-6">
  <div class="max-w-3xl mx-auto">
    <h1 class="text-3xl font-bold text-gray-900 mb-2">Agent Inbox</h1>
    <p class="text-gray-600 mb-6">Live signal feed from the Founder Command Center. Post new signals via <code class="bg-gray-200 px-1 rounded">POST /inbox</code>.</p>

    <form id="signal-form" class="bg-white p-4 rounded shadow border border-gray-200 mb-6" onsubmit="postSignal(event)">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <input name="title" type="text" placeholder="Signal title" class="w-full border rounded px-3 py-2" required />
        <select name="priority" class="w-full border rounded px-3 py-2">
          <option value="low">Low</option>
          <option value="medium" selected>Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <input name="source_type" type="text" placeholder="Source (e.g. email, github)" class="w-full border rounded px-3 py-2" />
        <input name="signal_type" type="text" placeholder="Signal type (e.g. incident.alert)" class="w-full border rounded px-3 py-2" />
      </div>
      <textarea name="body" rows="3" placeholder="Signal body..." class="w-full border rounded px-3 py-2 mb-4" required></textarea>
      <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Ingest Signal</button>
      <p id="form-status" class="mt-2 text-sm text-gray-600"></p>
    </form>

    <div id="feed">${items}</div>
  </div>

  <script>
    async function postSignal(e) {
      e.preventDefault();
      const form = e.target;
      const data = Object.fromEntries(new FormData(form));
      data.confidence = 0.9;
      const status = document.getElementById('form-status');
      try {
        const res = await fetch('/inbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(await res.text());
        status.textContent = 'Signal ingested. Reloading...';
        status.className = 'mt-2 text-sm text-green-600';
        setTimeout(() => window.location.reload(), 750);
      } catch (err) {
        status.textContent = 'Error: ' + err.message;
        status.className = 'mt-2 text-sm text-red-600';
      }
    }

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

const metrics = createMetricsRegistry("mss_");

// ─── Rate Limiter ──────────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  let entry = rateLimitStore.get(ip);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitStore.set(ip, entry);
  }

  entry.count++;
  const allowed = entry.count <= RATE_LIMIT_MAX_REQUESTS;
  const remaining = Math.max(0, RATE_LIMIT_MAX_REQUESTS - entry.count);

  return { allowed, remaining, resetAt: entry.resetAt };
}

// Cleanup rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(ip);
  }
}, 60_000);

// ─── Authentication ────────────────────────────────────────────────────────────

function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = Buffer.from(a);
  const bBytes = Buffer.from(b);
  if (aBytes.length !== bBytes.length) return false;
  return timingSafeEqual(aBytes, bBytes);
}

function validateAuth(req: IncomingMessage): boolean {
  if (!API_SECRET) return true; // Auth disabled if no secret configured

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return false;

  const token = auth.slice(7);
  return constantTimeEqual(token, API_SECRET);
}

// ─── Input Validation ──────────────────────────────────────────────────────────

async function readBody(req: IncomingMessage, maxSize: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        reject(new Error("Payload too large"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function validateContentType(req: IncomingMessage, allowed: string[]): boolean {
  const ct = req.headers["content-type"];
  if (!ct) return false;
  return allowed.some((a) => ct.includes(a));
}

// ─── Security Headers ───────────────────────────────────────────────────────────

function setSecurityHeaders(res: ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Content-Security-Policy", "default-src 'self'");
  if (API_SECRET) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
}

function setCorsHeaders(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;

  if (ALLOWED_ORIGINS.length > 0 && origin) {
    if (ALLOWED_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    // If origin not in whitelist, don't set CORS headers (browser will block)
  } else if (ALLOWED_ORIGINS.length === 0) {
    // Development mode: allow all origins with warning
    console.warn("[SECURITY] CORS: No MCP_ALLOWED_ORIGINS set, allowing all origins");
    res.setHeader("Access-Control-Allow-Origin", "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// ─── Error Handling ─────────────────────────────────────────────────────────────

interface ErrorBody {
  error: string;
  code: string;
  requestId?: string;
}

const ERROR_CODES: Record<string, { message: string; status: number }> = {
  UNAUTHORIZED: { message: "Unauthorized", status: 401 },
  FORBIDDEN: { message: "Forbidden", status: 403 },
  NOT_FOUND: { message: "Not found", status: 404 },
  PAYLOAD_TOO_LARGE: { message: "Payload too large", status: 413 },
  RATE_LIMITED: { message: "Too many requests", status: 429 },
  INVALID_CONTENT_TYPE: { message: "Invalid content type", status: 415 },
  BAD_REQUEST: { message: "Bad request", status: 400 },
  INTERNAL_ERROR: { message: "Internal server error", status: 500 },
};

function sendError(
  res: ServerResponse,
  code: keyof typeof ERROR_CODES,
  requestId?: string
): void {
  const errorInfo = ERROR_CODES[code] || ERROR_CODES.INTERNAL_ERROR;
  if (!errorInfo) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error", code: "INTERNAL_ERROR" }));
    return;
  }
  const { message, status } = errorInfo;
  const body: ErrorBody = { error: message, code };
  if (requestId) body.requestId = requestId;

  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function generateRequestId(): string {
  return randomBytes(8).toString("hex");
}

// ─── Server Setup ──────────────────────────────────────────────────────────────

const server = createMCPServer();

const httpServer = createServer(async (req, res) => {
  const requestId = generateRequestId();
  const ip = (req.socket.remoteAddress || "unknown").replace(/^::ffff:/, "");
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const startTime = Date.now();

  // Set security headers on all responses
  setSecurityHeaders(res);
  setCorsHeaders(req, res);

  // Rate limiting
  const rateLimit = checkRateLimit(ip);
  res.setHeader("X-RateLimit-Limit", RATE_LIMIT_MAX_REQUESTS.toString());
  res.setHeader("X-RateLimit-Remaining", rateLimit.remaining.toString());
  res.setHeader("X-RateLimit-Reset", rateLimit.resetAt.toString());

  if (!rateLimit.allowed) {
    console.log(`[${requestId}] RATE LIMITED ${ip} ${req.method} ${url.pathname}`);
    sendError(res, "RATE_LIMITED", requestId);
    return;
  }

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // ─── Public Endpoints (no auth required) ─────────────────────────────────────

  // Health check - always public for load balancers
  if (url.pathname === "/health" && req.method === "GET") {
    const timer = new Timer();
    try {
      const health = await server.health();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(health));
      metrics.inc("http_requests_total", { method: "GET", path: "/health", status: "200" });
      metrics.observe("http_request_duration_seconds", timer.elapsed(), { method: "GET", path: "/health" });
    } catch (err) {
      console.error(`[${requestId}] Health check error:`, err);
      sendError(res, "INTERNAL_ERROR", requestId);
      metrics.inc("http_requests_total", { method: "GET", path: "/health", status: "500" });
      metrics.observe("http_request_duration_seconds", timer.elapsed(), { method: "GET", path: "/health" });
    }
    return;
  }

  // Prometheus metrics endpoint - public for monitoring systems
  if (url.pathname === "/metrics" && req.method === "GET") {
    const timer = new Timer();
    try {
      // Update session gauge
      metrics.set("sessions_active", server.getStatus().activeSessions);
      
      const metricsOutput = metrics.export();
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(metricsOutput);
      metrics.inc("http_requests_total", { method: "GET", path: "/metrics", status: "200" });
      metrics.observe("http_request_duration_seconds", timer.elapsed(), { method: "GET", path: "/metrics" });
    } catch (err) {
      console.error(`[${requestId}] Metrics error:`, err);
      sendError(res, "INTERNAL_ERROR", requestId);
      metrics.inc("http_requests_total", { method: "GET", path: "/metrics", status: "500" });
      metrics.observe("http_request_duration_seconds", timer.elapsed(), { method: "GET", path: "/metrics" });
    }
    return;
  }

  // ─── Agent Inbox (public signal dashboard + ingestion) ────────────────────────

  if (url.pathname === "/inbox" || url.pathname === "/inbox/") {
    const timer = new Timer();
    if (req.method === "GET") {
      try {
        const format =
          url.searchParams.get("format") === "html" ||
          (req.headers.accept && req.headers.accept.includes("text/html"))
            ? "html"
            : "json";
        const signals = sortSignals(await loadSignals());
        if (format === "html") {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(renderInboxHTML(signals));
        } else {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ count: signals.length, signals }));
        }
        metrics.inc("http_requests_total", { method: "GET", path: "/inbox", status: "200" });
        metrics.observe("http_request_duration_seconds", timer.elapsed(), { method: "GET", path: "/inbox" });
      } catch (err) {
        console.error(`[${requestId}] Inbox GET error:`, err);
        sendError(res, "INTERNAL_ERROR", requestId);
        metrics.inc("http_requests_total", { method: "GET", path: "/inbox", status: "500" });
        metrics.observe("http_request_duration_seconds", timer.elapsed(), { method: "GET", path: "/inbox" });
      }
      return;
    }

    if (req.method === "POST") {
      if (!validateContentType(req, ["application/json"])) {
        sendError(res, "INVALID_CONTENT_TYPE", requestId);
        return;
      }
      try {
        const body = await readBody(req, MAX_BODY_SIZE);
        const payload = JSON.parse(body.toString()) as Record<string, unknown>;
        const now = new Date().toISOString();
        const signal: InboxSignal = {
          id: generateSignalId(),
          schema_version: "1.0.0",
          created_at: now,
          updated_at: now,
          source_type: String(payload.source_type ?? "inbox"),
          source_ref: payload.source_ref ? String(payload.source_ref) : undefined,
          title: String(payload.title ?? "New signal"),
          body: String(payload.body ?? ""),
          priority: ["critical", "high", "medium", "low"].includes(String(payload.priority))
            ? String(payload.priority)
            : "medium",
          confidence: typeof payload.confidence === "number" ? payload.confidence : 0.9,
          status: "classified",
          signal_type: String(payload.signal_type ?? "inbox.received"),
          correlation_id: `corr_${Date.now()}`,
        };
        await saveSignal(signal);
        console.log(`[${requestId}] INBOX_INGESTED ${signal.id} ${signal.priority} ${signal.title}`);
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, signal }));
        metrics.inc("http_requests_total", { method: "POST", path: "/inbox", status: "201" });
        metrics.observe("http_request_duration_seconds", timer.elapsed(), { method: "POST", path: "/inbox" });
      } catch (err) {
        console.error(`[${requestId}] Inbox POST error:`, err);
        sendError(res, "BAD_REQUEST", requestId);
        metrics.inc("http_requests_total", { method: "POST", path: "/inbox", status: "400" });
        metrics.observe("http_request_duration_seconds", timer.elapsed(), { method: "POST", path: "/inbox" });
      }
      return;
    }
  }

  // ─── Protected Endpoints (auth required) ────────────────────────────────────

  // Check authentication for all other endpoints
  if (!validateAuth(req)) {
    console.log(`[${requestId}] UNAUTHORIZED ${ip} ${req.method} ${url.pathname}`);
    sendError(res, "UNAUTHORIZED", requestId);
    return;
  }

  // Status endpoint
  if (url.pathname === "/status" && req.method === "GET") {
    const timer = new Timer();
    try {
      const status = server.getStatus();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(status));
      metrics.inc("http_requests_total", { method: "GET", path: "/status", status: "200" });
      metrics.observe("http_request_duration_seconds", timer.elapsed(), { method: "GET", path: "/status" });
    } catch (err) {
      console.error(`[${requestId}] Status error:`, err);
      sendError(res, "INTERNAL_ERROR", requestId);
      metrics.inc("http_requests_total", { method: "GET", path: "/status", status: "500" });
      metrics.observe("http_request_duration_seconds", timer.elapsed(), { method: "GET", path: "/status" });
    }
    return;
  }

  // Root endpoint
  if (url.pathname === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        name: "mcp-super-server",
        version: "0.0.1",
        endpoints: ["/health", "/status", "/metrics", "/voice/session", "/tool/invoke"],
        documentation: "MCP Super-Server HTTP API",
      })
    );
    return;
  }

  // ─── POST Endpoints with Body Validation ─────────────────────────────────────

  if (req.method === "POST") {
    if (!validateContentType(req, ["application/json"])) {
      sendError(res, "INVALID_CONTENT_TYPE", requestId);
      return;
    }

    let body: Buffer;
    try {
      body = await readBody(req, MAX_BODY_SIZE);
    } catch (err) {
      console.log(`[${requestId}] PAYLOAD_TOO_LARGE ${ip} ${url.pathname}`);
      sendError(res, "PAYLOAD_TOO_LARGE", requestId);
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(body.toString());
    } catch {
      sendError(res, "BAD_REQUEST", requestId);
      return;
    }

    // Voice session creation
    if (url.pathname === "/voice/session") {
      try {
        const { platform, platformId } = payload as { platform: string; platformId: string };
        if (!platform || !platformId) {
          sendError(res, "BAD_REQUEST", requestId);
          return;
        }

        const { canonicalUserId } = await server.resolveIdentity(platform, platformId);
        const { sessionId } = server.createVoiceSession(canonicalUserId, platform);

        console.log(`[${requestId}] VOICE_SESSION_CREATED ${sessionId} ${canonicalUserId}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ sessionId, state: "idle" }));
      } catch (err) {
        console.error(`[${requestId}] Voice session error:`, err);
        sendError(res, "INTERNAL_ERROR", requestId);
      }
      return;
    }

    // Tool invocation
    if (url.pathname === "/tool/invoke") {
      try {
        const { sessionId, toolId, input } = payload as {
          sessionId: string;
          toolId: string;
          input: Record<string, unknown>;
        };

        if (!sessionId || !toolId) {
          sendError(res, "BAD_REQUEST", requestId);
          return;
        }

        const result = await server.invokeTool(sessionId, toolId, input || {});
        console.log(`[${requestId}] TOOL_INVOKED ${toolId} ${result.decision}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (err) {
        console.error(`[${requestId}] Tool invocation error:`, err);
        sendError(res, "INTERNAL_ERROR", requestId);
      }
      return;
    }
  }

  // 404 for unknown routes
  console.log(`[${requestId}] NOT_FOUND ${ip} ${req.method} ${url.pathname}`);
  sendError(res, "NOT_FOUND", requestId);
});

// ─── Server Startup ────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           MCP SUPER-SERVER (Hardened)                         ║
╠═══════════════════════════════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(57)}║
║  Health: http://localhost:${PORT}/health${" ".repeat(32 - PORT.toString().length)}║
║  Auth: ${API_SECRET ? "Enabled (Bearer token)" : "Disabled (no MCP_API_SECRET)".padEnd(48)}║
║  CORS: ${(ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS.join(", ") : "Allow all (dev mode)").padEnd(50)}║
║  Rate Limit: ${RATE_LIMIT_MAX_REQUESTS} req/min${" ".repeat(43)}║
╚═══════════════════════════════════════════════════════════════╝
`);
});

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[${signal}] Graceful shutdown initiated...`);

  // Stop accepting new connections
  httpServer.close(() => {
    console.log("[Shutdown] HTTP server closed");
    process.exit(0);
  });

  // Force shutdown after timeout
  setTimeout(() => {
    console.log("[Shutdown] Force exit after timeout");
    process.exit(1);
  }, 10_000);

  // Cleanup server resources
  try {
    await server.stop();
    console.log("[Shutdown] Server stopped");
  } catch (err) {
    console.error("[Shutdown] Error stopping server:", err);
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  gracefulShutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  console.error("[ERROR] Unhandled rejection:", reason);
});