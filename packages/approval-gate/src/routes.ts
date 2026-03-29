/**
 * @mss/approval-gate - Routes
 * HTTP API routes for approval management
 */

import type { Context } from "hono";
import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import {
  CreateApprovalRequestSchema,
  ApprovalActionResponseSchema,
} from "./schema.js";
import type { ApprovalQueue } from "./queue.js";
import type { ApprovalNotifier } from "./notify.js";

function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = Buffer.from(a);
  const bBytes = Buffer.from(b);
  if (aBytes.length !== bBytes.length) return false;
  return timingSafeEqual(aBytes, bBytes);
}

function requireAuth(c: Context, authToken?: string): Response | null {
  if (!authToken) return null;
  const auth = c.req.header("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = auth.slice(7);
  if (!constantTimeEqual(token, authToken)) {
    return c.json({ error: "Invalid token" }, 401);
  }
  return null;
}

/**
 * Create approval gate API routes.
 */
export function createApprovalRoutes(
  queue: ApprovalQueue,
  notifier: ApprovalNotifier,
  opts?: { authToken?: string }
): Hono {
  const app = new Hono();

  const authMiddleware = async (c: Context, next: () => Promise<void>) => {
    const denied = requireAuth(c, opts?.authToken);
    if (denied) return denied;
    await next();
  };

  /**
   * POST /approval-requests - Create new request
   */
  app.post("/", authMiddleware, async (c: Context) => {
    const body = await c.req.json();
    const parsed = CreateApprovalRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
    }

    const request = await queue.create(parsed.data);
    await notifier.notify(request, "Remy");

    return c.json(request, 201);
  });

  /**
   * GET /approval-requests/pending - List pending requests
   */
  app.get("/pending", authMiddleware, async (c: Context) => {
    const pending = queue.getPending();
    return c.json({ requests: pending, total: pending.length });
  });

  /**
   * GET /approval-requests/stats - Queue stats
   */
  app.get("/stats", authMiddleware, async (c: Context) => {
    return c.json(queue.stats());
  });

  /**
   * GET /approval-requests/:id - Get request details
   */
  app.get("/:id", authMiddleware, async (c: Context) => {
    const id = String(c.req.param("id"));
    const request = queue.get(id);

    if (!request) {
      return c.json({ error: "Request not found" }, 404);
    }

    return c.json(request);
  });

  /**
   * POST /approval-requests/:id/approve - Approve request
   */
  app.post("/:id/approve", authMiddleware, async (c: Context) => {
    const id = String(c.req.param("id"));
    const actor = String(c.req.header("x-actor") ?? "unknown");

    const request = await queue.approve(id, actor);

    if (!request) {
      return c.json({ error: "Request not found or not pending" }, 404);
    }

    const response = {
      id: request.id,
      status: request.status,
      action: request.action,
      decided_at: new Date().toISOString(),
      decided_by: actor,
    };

    return c.json(ApprovalActionResponseSchema.parse(response));
  });

  /**
   * POST /approval-requests/:id/deny - Deny request
   */
  app.post("/:id/deny", authMiddleware, async (c: Context) => {
    const id = String(c.req.param("id"));
    const actor = String(c.req.header("x-actor") ?? "unknown");

    const request = await queue.deny(id, actor);

    if (!request) {
      return c.json({ error: "Request not found or not pending" }, 404);
    }

    const response = {
      id: request.id,
      status: request.status,
      action: request.action,
      decided_at: new Date().toISOString(),
      decided_by: actor,
    };

    return c.json(ApprovalActionResponseSchema.parse(response));
  });

  /**
   * GET /approval-requests/:id/status - Check status
   */
  app.get("/:id/status", authMiddleware, async (c: Context) => {
    const id = String(c.req.param("id"));
    const request = queue.get(id);

    if (!request) {
      return c.json({ error: "Request not found" }, 404);
    }

    return c.json({
      id: request.id,
      status: request.status,
      created_at: request.created_at,
    });
  });

  return app;
}
