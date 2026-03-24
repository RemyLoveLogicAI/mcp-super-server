/**
 * Tool invocation events.
 * Whitepaper §5 Pillar 2: Autonomous Agents & Tools
 */

import { z } from "../schemas/zod";
import { CoreEventBase } from "./base.js";
import type { SideEffectClass, ApprovalPolicy } from "../policies/effects";

export const ToolCallRequested = CoreEventBase.extend({
  event_type: z.literal("ToolCallRequested"),
  tool_call_id: z.string(),
  tool_id: z.string(),
  tool_version: z.string(),
  purpose: z.string(),
  side_effect_class: z.string() as z.ZodType<SideEffectClass>,
  timeout_ms: z.number().int().positive(),
  approval: z.string() as z.ZodType<ApprovalPolicy>,
  scopes: z.array(z.string()).optional(),
  input: z.unknown()
});

export type ToolCallRequested = z.infer<typeof ToolCallRequested>;

export const ToolCallCompleted = CoreEventBase.extend({
  event_type: z.literal("ToolCallCompleted"),
  tool_call_id: z.string(),
  ok: z.boolean(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  duration_ms: z.number().int().nonnegative()
});

export type ToolCallCompleted = z.infer<typeof ToolCallCompleted>;

export const ToolCallCanceled = CoreEventBase.extend({
  event_type: z.literal("ToolCallCanceled"),
  tool_call_id: z.string(),
  reason: z.string(),
  partial_execution: z.boolean().optional()
});

export type ToolCallCanceled = z.infer<typeof ToolCallCanceled>;

export const ToolEvents = {
  ToolCallRequested,
  ToolCallCompleted,
  ToolCallCanceled
} as const;
