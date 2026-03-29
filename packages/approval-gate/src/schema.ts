/**
 * @mss/approval-gate - Schema
 * Approval Request type definitions
 */

import { z } from "zod";

/**
 * Risk levels for approval requests.
 * Determines timeout and notification behavior.
 */
export const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

/**
 * Status of an approval request.
 */
export const ApprovalStatusSchema = z.enum(["pending", "approved", "denied", "expired"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

/**
 * Approval request schema.
 * Represents a pending human approval for an action.
 */
export const ApprovalRequestSchema = z.object({
  id: z.string(),
  action: z.string(),
  risk_level: RiskLevelSchema,
  reversibility: z.boolean(),
  timeout_ms: z.number(),
  created_at: z.string(),
  context: z.record(z.unknown()),
  proposed_by: z.string(),
  status: ApprovalStatusSchema,
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

/**
 * Request to create a new approval request.
 */
export const CreateApprovalRequestSchema = z.object({
  action: z.string(),
  risk_level: RiskLevelSchema,
  reversibility: z.boolean(),
  timeout_ms: z.number().optional(),
  context: z.record(z.unknown()).optional(),
  proposed_by: z.string(),
});
export type CreateApprovalRequest = z.infer<typeof CreateApprovalRequestSchema>;

/**
 * Response for approval action.
 */
export const ApprovalActionResponseSchema = z.object({
  id: z.string(),
  status: ApprovalStatusSchema,
  action: z.string(),
  decided_at: z.string(),
  decided_by: z.string().optional(),
});
export type ApprovalActionResponse = z.infer<typeof ApprovalActionResponseSchema>;

/**
 * Default timeout by risk level (in milliseconds).
 * low: 5 minutes, medium: 3 minutes, high: 1 minute, critical: 30 seconds
 */
export const DEFAULT_TIMEOUTS: Record<RiskLevel, number> = {
  low: 5 * 60 * 1000,
  medium: 3 * 60 * 1000,
  high: 1 * 60 * 1000,
  critical: 30 * 1000,
};

/**
 * Get default timeout for a risk level.
 */
export function getDefaultTimeout(riskLevel: RiskLevel): number {
  return DEFAULT_TIMEOUTS[riskLevel];
}
