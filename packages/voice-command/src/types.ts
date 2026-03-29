/**
 * @mss/voice-command - Types
 * Voice Command Interface types for the MCP Super-Server
 */

import { z } from "zod";

// ============================================================================
// Intent Types
// ============================================================================

export const VoiceCommandIntentSchema = z.object({
  action: z.string(),
  target: z.string().optional(),
  resource: z.string().optional(),
  scope: z.string().optional(),
  modifiers: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
  ambiguity: z.boolean().optional(),
  clarification_needed: z.boolean().optional(),
  original_text: z.string(),
});

export type VoiceCommandIntent = z.infer<typeof VoiceCommandIntentSchema>;

// ============================================================================
// Tool Routing Types
// ============================================================================

export const ToolMatchSchema = z.object({
  tool_id: z.string(),
  tool_name: z.string(),
  capability_score: z.number().min(0).max(1),
  parameters: z.record(z.unknown()).optional(),
});

export type ToolMatch = z.infer<typeof ToolMatchSchema>;

export const RoutingResultSchema = z.object({
  success: z.boolean(),
  matches: z.array(ToolMatchSchema),
  requires_approval: z.boolean().optional(),
  error: z.string().optional(),
});

export type RoutingResult = z.infer<typeof RoutingResultSchema>;

// ============================================================================
// Execution Types
// ============================================================================

export const ExecutionStatusEnum = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
  "requires_approval",
]);

export type ExecutionStatus = z.infer<typeof ExecutionStatusEnum>;

export const ExecutionResultSchema = z.object({
  execution_id: z.string(),
  tool_call_id: z.string().optional(),
  status: ExecutionStatusEnum,
  result: z.unknown().optional(),
  error: z.string().optional(),
  progress_messages: z.array(z.string()).optional(),
});

export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

// ============================================================================
// Context Types
// ============================================================================

export const ConversationTurnSchema = z.object({
  turn_id: z.number(),
  transcript: z.string(),
  intent: VoiceCommandIntentSchema.optional(),
  execution_results: z.array(ExecutionResultSchema).optional(),
  timestamp: z.string(),
});

export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;

export const ProjectContextSchema = z.object({
  project_name: z.string().optional(),
  project_path: z.string().optional(),
  current_files: z.array(z.string()).optional(),
  recent_errors: z.array(z.string()).optional(),
  environment: z.string().optional(),
});

export type ProjectContext = z.infer<typeof ProjectContextSchema>;

export const VoiceCommandContextSchema = z.object({
  session_id: z.string(),
  user_id: z.string(),
  channel: z.string(),
  working_directory: z.string().optional(),
  project: ProjectContextSchema.optional(),
  conversation_history: z.array(ConversationTurnSchema).optional(),
  fsm_state: z.string().optional(),
});

export type VoiceCommandContext = z.infer<typeof VoiceCommandContextSchema>;

// ============================================================================
// Confirmation Types
// ============================================================================

export const ConfirmationRequestSchema = z.object({
  request_id: z.string(),
  action_description: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  requires_verbal_confirmation: z.boolean().optional(),
  timeout_ms: z.number().optional(),
});

export type ConfirmationRequest = z.infer<typeof ConfirmationRequestSchema>;

export const ConfirmationResponseSchema = z.object({
  request_id: z.string(),
  confirmed: z.boolean(),
  response_text: z.string().optional(),
});

export type ConfirmationResponse = z.infer<typeof ConfirmationResponseSchema>;

// ============================================================================
// Flow Types
// ============================================================================

export const FlowEventSchema = z.object({
  flow_id: z.string(),
  event_type: z.enum([
    "intent_parsed",
    "routing_completed",
    "approval_required",
    "execution_started",
    "execution_progress",
    "execution_completed",
    "execution_failed",
    "barge_in_received",
    "flow_cancelled",
  ]),
  data: z.record(z.unknown()).optional(),
  timestamp: z.string(),
});

export type FlowEvent = z.infer<typeof FlowEventSchema>;

// ============================================================================
// FSM Integration Types
// ============================================================================

export type VoiceCommandEvent =
  | { type: "COMMAND_RECEIVED"; transcript: string }
  | { type: "INTENT_PARSED"; intent: VoiceCommandIntent }
  | { type: "TOOL_SELECTED"; tool_id: string; tool_name: string }
  | { type: "APPROVAL_REQUESTED"; request: ConfirmationRequest }
  | { type: "APPROVAL_RECEIVED"; response: ConfirmationResponse }
  | { type: "EXECUTION_STARTED"; execution_id: string }
  | { type: "EXECUTION_PROGRESS"; execution_id: string; message: string }
  | { type: "EXECUTION_COMPLETED"; execution_id: string; result: unknown }
  | { type: "EXECUTION_FAILED"; execution_id: string; error: string }
  | { type: "FLOW_CANCELLED"; reason: string }
  | { type: "RESPONSE_GENERATED"; text: string };
