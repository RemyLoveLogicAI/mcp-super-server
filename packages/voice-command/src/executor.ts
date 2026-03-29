/**
 * @mss/voice-command - Action Executor
 * Executes tool calls with confirmation, progress, and error handling
 */

import {
  ExecutionResultSchema,
  ExecutionStatusEnum,
  type ExecutionResult,
  type ExecutionStatus,
} from "./types";
import { PolicyToolGate } from "@mss/tools";
import type { SessionId, ToolCallId, UUID } from "@mss/core/ids";

// ============================================================================
// Execution Events
// ============================================================================

export type ExecutorEvent =
  | { type: "execution_starting"; execution_id: string; tool: { tool_id: string; tool_name: string; capability_score: number } }
  | { type: "gate_approved"; execution_id: string }
  | { type: "gate_denied"; execution_id: string; reason: string }
  | { type: "gate_requires_human"; execution_id: string; context: string }
  | { type: "tool_call_started"; execution_id: string; tool_call_id: string }
  | { type: "tool_call_progress"; execution_id: string; message: string }
  | { type: "tool_call_completed"; execution_id: string; result: unknown }
  | { type: "tool_call_failed"; execution_id: string; error: string }
  | { type: "execution_cancelled"; execution_id: string; reason: string }
  | { type: "retry_attempt"; execution_id: string; attempt: number; maxAttempts: number };

// ============================================================================
// Executor Configuration
// ============================================================================

export interface ExecutorConfig {
  maxRetries: number;
  retryDelayMs: number;
  progressIntervalMs: number;
  defaultTimeoutMs: number;
  enableProgressReporting: boolean;
}

export const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  progressIntervalMs: 5000,
  defaultTimeoutMs: 30000,
  enableProgressReporting: true,
};

// ============================================================================
// Action Executor
// ============================================================================

export type ExecutorEventHandler = (event: ExecutorEvent) => void;

type NormalizedToolMatch = {
  tool_id: string;
  tool_name: string;
  capability_score?: number;
  parameters: Record<string, unknown>;
};

export class ActionExecutor {
  private config: ExecutorConfig;
  private toolGate: PolicyToolGate | null;
  private sessionId: SessionId | null;
  private userId: UUID | null;
  private eventHandlers: Set<ExecutorEventHandler>;
  private activeExecutions: Map<string, { cancelled: boolean }>;

  constructor(
    config: Partial<ExecutorConfig> = {},
    toolGate?: PolicyToolGate
  ) {
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config };
    this.toolGate = toolGate ?? null;
    this.sessionId = null;
    this.userId = null;
    this.eventHandlers = new Set();
    this.activeExecutions = new Map();
  }

  /**
   * Set session context
   */
  setSessionContext(sessionId: SessionId, userId: UUID): void {
    this.sessionId = sessionId;
    this.userId = userId;
  }

  /**
   * Subscribe to execution events
   */
  onEvent(handler: ExecutorEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Emit an event to all handlers
   */
  private emit(event: ExecutorEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch {
        // Ignore handler errors
      }
    }
  }

  /**
   * Execute a tool match with parameters
   */
  async execute(
    toolMatch: NormalizedToolMatch,
    parameters: Record<string, unknown> = {}
  ): Promise<ExecutionResult> {
    const executionId = this.generateExecutionId();

    // Check if cancelled
    const executionState = { cancelled: false };
    this.activeExecutions.set(executionId, executionState);

    try {
      // Emit starting event
      this.emit({
        type: "execution_starting",
        execution_id: executionId,
        tool: { tool_id: toolMatch.tool_id, tool_name: toolMatch.tool_name, capability_score: toolMatch.capability_score || 0.5 },
      });

      // Evaluate gate if available
      if (this.toolGate && this.sessionId && this.userId) {
        const gateResult = await this.evaluateGate(toolMatch, parameters);
        if (gateResult.decision === "deny") {
          this.emit({
            type: "gate_denied",
            execution_id: executionId,
            reason: String(gateResult.reason || "Unknown"),
          });
          return ExecutionResultSchema.parse({
            execution_id: executionId,
            status: "failed",
            error: `Gate denied: ${gateResult.reason || "Unknown"}`,
          });
        }
        if (gateResult.decision === "require_human") {
          this.emit({
            type: "gate_requires_human",
            execution_id: executionId,
            context: gateResult.approval_context || "Approval required",
          });
          return ExecutionResultSchema.parse({
            execution_id: executionId,
            status: "requires_approval",
            error: "Human approval required",
          });
        }
        this.emit({ type: "gate_approved", execution_id: executionId });
      }

      // Execute with retries
      let lastError: string | undefined;
      for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
        // Check cancellation
        if (executionState.cancelled) {
          this.emit({
            type: "execution_cancelled",
            execution_id: executionId,
            reason: "Cancelled by user",
          });
          return ExecutionResultSchema.parse({
            execution_id: executionId,
            status: "cancelled",
          });
        }

        if (attempt > 1) {
          this.emit({
            type: "retry_attempt",
            execution_id: executionId,
            attempt,
            maxAttempts: this.config.maxRetries,
          });
          await this.delay(this.config.retryDelayMs * (attempt - 1));
        }

        try {
          const result = await this.executeToolCall(
            executionId,
            toolMatch,
            parameters,
            executionState
          );
          this.activeExecutions.delete(executionId);
          return result;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
      }

      // All retries failed
      this.emit({
        type: "tool_call_failed",
        execution_id: executionId,
        error: lastError || "Unknown error",
      });
      this.activeExecutions.delete(executionId);
      return ExecutionResultSchema.parse({
        execution_id: executionId,
        status: "failed",
        error: lastError,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.emit({
        type: "tool_call_failed",
        execution_id: executionId,
        error: errorMessage,
      });
      this.activeExecutions.delete(executionId);
      return ExecutionResultSchema.parse({
        execution_id: executionId,
        status: "failed",
        error: errorMessage,
      });
    }
  }

  /**
   * Cancel an active execution
   */
  cancel(executionId: string): boolean {
    const state = this.activeExecutions.get(executionId);
    if (state) {
      state.cancelled = true;
      this.emit({
        type: "execution_cancelled",
        execution_id: executionId,
        reason: "Cancellation requested",
      });
      return true;
    }
    return false;
  }

  /**
   * Cancel all active executions
   */
  cancelAll(): void {
    for (const [executionId, state] of this.activeExecutions) {
      state.cancelled = true;
      this.emit({
        type: "execution_cancelled",
        execution_id: executionId,
        reason: "Bulk cancellation requested",
      });
    }
  }

  /**
   * Evaluate gate for tool access
   */
  private async evaluateGate(
    toolMatch: Pick<NormalizedToolMatch, "tool_id" | "tool_name">,
    _parameters: Record<string, unknown>
  ): Promise<{ decision: "allow" | "deny" | "require_human"; reason?: unknown; approval_context?: string }> {
    if (!this.toolGate || !this.sessionId || !this.userId) {
      return { decision: "allow" };
    }

    try {
      const result = await this.toolGate.evaluate({
        tool_id: toolMatch.tool_id as ToolCallId,
        session_id: this.sessionId,
        canonical_user_id: this.userId,
        requested_effect: { sideEffect: "reversible_write", approval: "auto" },
        purpose: `Voice command execution: ${toolMatch.tool_name}`,
      });

      if (result.decision === "allow") {
        return { decision: "allow" };
      }
      if (result.decision === "deny") {
        return { decision: "deny", reason: result.reason };
      }
      return { decision: "require_human", approval_context: result.approval_context || "Approval required" };
    } catch {
      return { decision: "allow" };
    }
  }

  /**
   * Execute a tool call (simulated - replace with actual tool execution)
   */
  private async executeToolCall(
    executionId: string,
    toolMatch: NormalizedToolMatch,
    parameters: Record<string, unknown>,
    executionState: { cancelled: boolean }
  ): Promise<ExecutionResult> {
    const toolCallId = this.generateToolCallId();

    this.emit({
      type: "tool_call_started",
      execution_id: executionId,
      tool_call_id: toolCallId,
    });

    // Simulate tool execution with progress
    const progressMessages = [
      `Initializing ${toolMatch.tool_name}...`,
      `Processing request...`,
      `Executing ${parameters.target || parameters.resource || "operation"}...`,
      `Finalizing...`,
    ];

    for (let i = 0; i < progressMessages.length; i++) {
      // Check cancellation
      if (executionState.cancelled) {
        return ExecutionResultSchema.parse({
          execution_id: executionId,
          status: "cancelled",
        });
      }

      // Emit progress
      this.emit({
        type: "tool_call_progress",
        execution_id: executionId,
        message: progressMessages[i]!,
      });

      // Simulate work
      await this.delay(500);
    }

    // Simulate successful execution
    const result = {
      success: true,
      tool: toolMatch.tool_name,
      parameters,
      output: `${toolMatch.tool_name} completed successfully`,
      timestamp: new Date().toISOString(),
    };

    this.emit({
      type: "tool_call_completed",
      execution_id: executionId,
      result,
    });

    return ExecutionResultSchema.parse({
      execution_id: executionId,
      status: "completed",
      result,
    });
  }

  /**
   * Generate execution ID
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Generate tool call ID
   */
  private generateToolCallId(): string {
    return crypto.randomUUID();
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createActionExecutor(
  config?: Partial<ExecutorConfig>,
  toolGate?: PolicyToolGate
): ActionExecutor {
  return new ActionExecutor(config, toolGate);
}
