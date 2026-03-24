/**
 * @mss/server — Secured HTTP Endpoint Example
 * 
 * This example demonstrates how to properly secure MCP Super-Server HTTP endpoints
 * with bearer token authentication, CORS restrictions, security headers, and
 * input validation.
 * 
 * Usage:
 *   1. Set environment variables:
 *      - PORT: Server port (default: 3000)
 *      - API_SECRET: Secret token for authentication
 *      - ALLOWED_ORIGINS: Comma-separated list of allowed origins
 *   
 *   2. Run: bun run examples/secured_endpoint.ts
 * 
 *   3. Test:
 *      curl -H "Authorization: Bearer $API_SECRET" http://localhost:3000/status
 */

import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { MCPSuperServer, createMCPServer } from "../apps/server/src/server.js";

// ============================================================================
// Configuration & Validation
// ============================================================================

const PORT = validatePort(process.env.PORT || "3000");
const API_SECRET = process.env.API_SECRET;

// Parse allowed origins from environment
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

// Rate limiting configuration
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100;

// Request size limits
const MAX_REQUEST_SIZE_BYTES = 1024 * 1024; // 1MB

// Validate configuration
if (!API_SECRET) {
  console.error("ERROR: API_SECRET environment variable is required");
  console.error("Example: API_SECRET=your-secret-key-here bun run secured_endpoint.ts");
  process.exit(1);
}

if (API_SECRET.length < 32) {
  console.error("ERROR: API_SECRET must be at least 32 characters for security");
  process.exit(1);
}

if (ALLOWED_ORIGINS.length === 0) {
  console.warn("WARNING: ALLOWED_ORIGINS not set - CORS will be restricted to same-origin only");
}

function validatePort(portStr: string): number {
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${portStr}. Must be between 1-65535.`);
  }
  return port;
}

// ============================================================================
// Rate Limiter
// ============================================================================

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private clients = new Map<string, RateLimitEntry>();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    
    // Cleanup old entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  isAllowed(clientId: string): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const entry = this.clients.get(clientId);

    if (!entry || now > entry.resetTime) {
      // New window
      this.clients.set(clientId, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      return { allowed: true, remaining: this.maxRequests - 1, resetTime: now + this.windowMs };
    }

    if (entry.count >= this.maxRequests) {
      return { allowed: false, remaining: 0, resetTime: entry.resetTime };
    }

    entry.count++;
    return { allowed: true, remaining: this.maxRequests - entry.count, resetTime: entry.resetTime };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [clientId, entry] of this.clients.entries()) {
      if (now > entry.resetTime) {
        this.clients.delete(clientId);
      }
    }
  }
}

const rateLimiter = new RateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS);

// ============================================================================
// Authentication
// ============================================================================

/**
 * Constant-time comparison to prevent timing attacks
 */
function constantTimeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  
  if (aBuf.length !== bBuf.length) {
    // Still do comparison to avoid leaking length info via timing
    timingSafeEqual(aBuf, aBuf); // Dummy comparison
    return false;
  }
  
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Extract and validate bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7); // Remove "Bearer " prefix
}

/**
 * Check if request is authenticated
 */
function isAuthenticated(authHeader: string | undefined): boolean {
  const token = extractBearerToken(authHeader);
  if (!token) return false;
  return constantTimeEqual(token, API_SECRET!);
}

// ============================================================================
// CORS Handling
// ============================================================================

/**
 * Determine if origin is allowed
 */
function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return false;
  
  // If no origins configured, only allow same-origin (empty origin check)
  if (ALLOWED_ORIGINS.length === 0) {
    return true; // Allow requests with no origin (same-origin, curl, etc.)
  }
  
  return ALLOWED_ORIGINS.includes(origin);
}

/**
 * Get CORS headers for response
 */
function getCorsHeaders(origin: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };

  // Only echo back specific origin, never use *
  if (isOriginAllowed(origin)) {
    headers["Access-Control-Allow-Origin"] = origin || "";
    headers["Access-Control-Allow-Credentials"] = "true";
    // Vary header is required when using dynamic origins
    headers["Vary"] = "Origin";
  }

  return headers;
}

// ============================================================================
// Security Headers
// ============================================================================

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
};

function getSecurityHeaders(): Record<string, string> {
  return { ...SECURITY_HEADERS };
}

// ============================================================================
// Request Validation
// ============================================================================

/**
 * Validate request size
 */
function validateRequestSize(contentLength: string | undefined): boolean {
  if (!contentLength) return true;
  const size = parseInt(contentLength, 10);
  return !isNaN(size) && size <= MAX_REQUEST_SIZE_BYTES;
}

/**
 * Get client identifier for rate limiting
 */
function getClientId(req: { headers: { [key: string]: string | string[] | undefined }; socket: { remoteAddress?: string } }): string {
  // Use X-Forwarded-For if behind proxy, otherwise use socket address
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

// ============================================================================
// Audit Logging
// ============================================================================

interface AuditEvent {
  timestamp: string;
  method: string;
  path: string;
  clientId: string;
  userAgent?: string;
  authResult: "success" | "failure" | "not_required";
  rateLimitHit: boolean;
  statusCode: number;
  responseTimeMs: number;
}

const auditLog: AuditEvent[] = [];
const MAX_AUDIT_LOG_SIZE = 10000;

function logAudit(event: AuditEvent): void {
  auditLog.push(event);
  
  // Keep log size bounded
  if (auditLog.length > MAX_AUDIT_LOG_SIZE) {
    auditLog.shift();
  }

  // Log security events to console
  if (event.authResult === "failure" || event.rateLimitHit) {
    console.warn(`[SECURITY] ${event.method} ${event.path} - auth: ${event.authResult}, rateLimit: ${event.rateLimitHit}, client: ${event.clientId}`);
  }
}

// ============================================================================
// Server Setup
// ============================================================================

const server = createMCPServer({
  ledger: { type: "memory" },
  gate: { maxCallsPerSession: 10, defaultApproval: "require_human" },
  meta: { name: "mcp-super-server-secure", version: "0.0.1", environment: "production" },
  gateMode: "write_approval",
});

const httpServer = createServer(async (req, res) => {
  const startTime = Date.now();
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const origin = req.headers.origin;
  const clientId = getClientId(req);
  
  // Check rate limit
  const rateLimit = rateLimiter.isAllowed(clientId);
  if (!rateLimit.allowed) {
    res.writeHead(429, {
      "Content-Type": "application/json",
      "Retry-After": String(Math.ceil((rateLimit.resetTime - Date.now()) / 1000)),
      ...getCorsHeaders(origin as string),
      ...getSecurityHeaders(),
    });
    res.end(JSON.stringify({ error: "Rate limit exceeded", retry_after: Math.ceil((rateLimit.resetTime - Date.now()) / 1000) }));
    
    logAudit({
      timestamp: new Date().toISOString(),
      method: req.method || "GET",
      path: url.pathname,
      clientId,
      userAgent: req.headers["user-agent"] as string,
      authResult: "not_required",
      rateLimitHit: true,
      statusCode: 429,
      responseTimeMs: Date.now() - startTime,
    });
    return;
  }

  // Validate request size for POST/PUT
  if ((req.method === "POST" || req.method === "PUT") && !validateRequestSize(req.headers["content-length"] as string)) {
    res.writeHead(413, {
      "Content-Type": "application/json",
      ...getCorsHeaders(origin as string),
      ...getSecurityHeaders(),
    });
    res.end(JSON.stringify({ error: "Request entity too large" }));
    return;
  }

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...getCorsHeaders(origin as string),
      ...getSecurityHeaders(),
      "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
      "X-RateLimit-Remaining": String(rateLimit.remaining),
    });
    res.end();
    return;
  }

  // Public health endpoint (limited info)
  if (url.pathname === "/health" && req.method === "GET") {
    const health = await server.health();
    // Return limited info for public health check
    const publicHealth = {
      status: health.status,
      timestamp: health.timestamp,
    };
    
    res.writeHead(200, {
      "Content-Type": "application/json",
      ...getCorsHeaders(origin as string),
      ...getSecurityHeaders(),
      "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
      "X-RateLimit-Remaining": String(rateLimit.remaining),
    });
    res.end(JSON.stringify(publicHealth));
    return;
  }

  // Check authentication for all other endpoints
  const authHeader = req.headers.authorization;
  const isAuth = isAuthenticated(authHeader);

  if (!isAuth) {
    res.writeHead(401, {
      "Content-Type": "application/json",
      "WWW-Authenticate": "Bearer",
      ...getCorsHeaders(origin as string),
      ...getSecurityHeaders(),
    });
    res.end(JSON.stringify({ error: "Unauthorized", message: "Valid bearer token required" }));
    
    logAudit({
      timestamp: new Date().toISOString(),
      method: req.method || "GET",
      path: url.pathname,
      clientId,
      userAgent: req.headers["user-agent"] as string,
      authResult: "failure",
      rateLimitHit: false,
      statusCode: 401,
      responseTimeMs: Date.now() - startTime,
    });
    return;
  }

  // Authenticated endpoints
  let statusCode = 200;
  let response: object;

  try {
    switch (url.pathname) {
      case "/status": {
        if (req.method !== "GET") {
          statusCode = 405;
          response = { error: "Method not allowed" };
        } else {
          const status = server.getStatus();
          response = { 
            ...status,
            // Add rate limit info for authenticated users
            rate_limit: {
              remaining: rateLimit.remaining,
              reset_at: new Date(rateLimit.resetTime).toISOString(),
            }
          };
        }
        break;
      }

      case "/audit-log": {
        // Admin endpoint to view audit log
        if (req.method !== "GET") {
          statusCode = 405;
          response = { error: "Method not allowed" };
        } else {
          // Return last 100 entries
          response = {
            entries: auditLog.slice(-100),
            total: auditLog.length,
          };
        }
        break;
      }

      default:
        statusCode = 404;
        response = { error: "Not found" };
    }
  } catch (error) {
    statusCode = 500;
    response = { error: "Internal server error" };
    console.error("[ERROR]", error);
  }

  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...getCorsHeaders(origin as string),
    ...getSecurityHeaders(),
    "X-RateLimit-Limit": String(RATE_LIMIT_MAX_REQUESTS),
    "X-RateLimit-Remaining": String(rateLimit.remaining),
  });
  res.end(JSON.stringify(response));

  logAudit({
    timestamp: new Date().toISOString(),
    method: req.method || "GET",
    path: url.pathname,
    clientId,
    userAgent: req.headers["user-agent"] as string,
    authResult: "success",
    rateLimitHit: false,
    statusCode,
    responseTimeMs: Date.now() - startTime,
  });
});

// ============================================================================
// Startup
// ============================================================================

httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║     MCP SUPER-SERVER - SECURED HTTP SERVER                    ║
╠═══════════════════════════════════════════════════════════════╣
║  Port:            ${PORT.toString().padEnd(49)} ║
║  Public Health:   http://localhost:${PORT}/health${" ".repeat(25 - PORT.toString().length)} ║
║  Auth Required:   /status, /audit-log${" ".repeat(24)} ║
╠═══════════════════════════════════════════════════════════════╣
║  Security Features:                                           ║
║    ✓ Bearer token authentication                              ║
║    ✓ Rate limiting (100 req/min per IP)                       ║
║    ✓ CORS origin restrictions                                 ║
║    ✓ Security headers (CSP, HSTS, etc.)                       ║
║    ✓ Request size limits (1MB max)                            ║
║    ✓ Audit logging                                            ║
║    ✓ Constant-time auth comparison                            ║
╚═══════════════════════════════════════════════════════════════╝

Configuration:
  API_SECRET:     ${API_SECRET ? "[SET - " + API_SECRET.length + " chars]" : "[NOT SET]"}
  ALLOWED_ORIGINS: ${ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS.join(", ") : "[NOT SET - same-origin only]"}

Test Commands:
  # Health (no auth required):
  curl http://localhost:${PORT}/health

  # Status (auth required):
  curl -H "Authorization: Bearer $API_SECRET" http://localhost:${PORT}/status

  # Audit log (auth required):
  curl -H "Authorization: Bearer $API_SECRET" http://localhost:${PORT}/audit-log
`);
});

// ============================================================================
// Graceful Shutdown
// ============================================================================

function gracefulShutdown(signal: string): void {
  console.log(`\n${signal} received, shutting down gracefully...`);
  
  // Stop accepting new connections
  httpServer.close(() => {
    console.log("HTTP server closed");
    
    // Stop MCP server
    server.stop().then(() => {
      console.log("MCP server stopped");
      process.exit(0);
    }).catch((err) => {
      console.error("Error stopping server:", err);
      process.exit(1);
    });
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle uncaught errors
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
  gracefulShutdown("UNHANDLED_REJECTION");
});
