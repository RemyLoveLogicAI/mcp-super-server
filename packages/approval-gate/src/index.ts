/**
 * @mss/approval-gate - Main Entry Point
 * Human-in-loop approval system for MCP Super-Server
 */

// Schema types
export * from "./schema.js";

// Queue
export { ApprovalQueue } from "./queue.js";
export type { ApprovalQueueConfig, ApprovalAuditEntry } from "./queue.js";

// Notifier
export { ApprovalNotifier } from "./notify.js";
export type { NotifyConfig } from "./notify.js";

// Gate integration
export { createApprovalGate, createApprovalGateWithPolicyGate } from "./gate.js";

// Routes
export { createApprovalRoutes } from "./routes.js";
