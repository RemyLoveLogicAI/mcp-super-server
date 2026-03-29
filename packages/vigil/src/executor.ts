/**
 * @mss/vigil — Auto-Repair Executor
 */

import type {
  RepairAction,
  RepairActionResult,
  RepairResult,
  Diagnosis,
  Subsystem,
  Solution,
  RepairActionType,
} from "./types.js";
import { VigilEventType } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Rate Limiter
// ─────────────────────────────────────────────────────────────────────────────

interface RateLimitWindow {
  count: number;
  windowStart: number;
}

export class RateLimiter {
  private perMinuteWindow: RateLimitWindow = { count: 0, windowStart: Date.now() };
  private perHourWindow: RateLimitWindow = { count: 0, windowStart: Date.now() };

  constructor(
    private maxPerMinute: number,
    private maxPerHour: number
  ) {}

  canRepair(): boolean {
    this.prune();
    return (
      this.perMinuteWindow.count < this.maxPerMinute &&
      this.perHourWindow.count < this.maxPerHour
    );
  }

  record(): void {
    this.prune();
    this.perMinuteWindow.count++;
    this.perHourWindow.count++;
  }

  reset(): void {
    this.perMinuteWindow = { count: 0, windowStart: Date.now() };
    this.perHourWindow = { count: 0, windowStart: Date.now() };
  }

  private prune(): void {
    const now = Date.now();
    if (now - this.perMinuteWindow.windowStart > 60_000) {
      this.perMinuteWindow = { count: 0, windowStart: now };
    }
    if (now - this.perHourWindow.windowStart > 3_600_000) {
      this.perHourWindow = { count: 0, windowStart: now };
    }
  }

  getStats() {
    this.prune();
    return {
      minuteUsed: this.perMinuteWindow.count,
      minuteLimit: this.maxPerMinute,
      hourUsed: this.perHourWindow.count,
      hourLimit: this.maxPerHour,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Handlers
// ─────────────────────────────────────────────────────────────────────────────

export type ActionContext = {
  subsystem?: Subsystem;
  sessionId?: string;
  ledgerAppend?: (event: Record<string, unknown>) => Promise<{ event_id: string }>;
  server?: {
    restart?: () => Promise<void>;
    getToolRegistry?: () => { clear?: () => void };
  };
};

export type ActionHandler = (
  action: RepairAction,
  context: ActionContext
) => Promise<RepairActionResult>;

// ─────────────────────────────────────────────────────────────────────────────
// Default Action Handlers
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_HANDLERS: Record<RepairActionType, ActionHandler> = {
  restart_service: async (action, context) => {
    const start = Date.now();
    try {
      if (context.server?.restart) {
        await context.server.restart();
      }
      return {
        action_id: action.id,
        success: true,
        duration_ms: Date.now() - start,
        output: "Service restarted",
      };
    } catch (err) {
      return {
        action_id: action.id,
        success: false,
        duration_ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  clear_cache: async (action, context) => {
    const start = Date.now();
    try {
      const reg = context.server?.getToolRegistry?.();
      if (reg?.clear) {
        reg.clear();
      }
      return {
        action_id: action.id,
        success: true,
        duration_ms: Date.now() - start,
        output: "Cache cleared",
      };
    } catch (err) {
      return {
        action_id: action.id,
        success: false,
        duration_ms: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },

  reset_session: async (action, context) => {
    const start = Date.now();
    return {
      action_id: action.id,
      success: true,
      duration_ms: Date.now() - start,
      output: "Session reset (no-op in generic executor)",
    };
  },

  rollback: async (action, _context) => {
    const start = Date.now();
    return {
      action_id: action.id,
      success: true,
      duration_ms: Date.now() - start,
      output: "Rollback executed (no-op)",
    };
  },

  reconfigure: async (action, _context) => {
    const start = Date.now();
    return {
      action_id: action.id,
      success: true,
      duration_ms: Date.now() - start,
      output: `Reconfigured with params: ${JSON.stringify(action.params ?? {})}`,
    };
  },

  restart_component: async (action, _context) => {
    const start = Date.now();
    const target = action.target ?? "unknown";
    return {
      action_id: action.id,
      success: true,
      duration_ms: Date.now() - start,
      output: `Component ${target} restarted (no-op)`,
    };
  },

  notify: async (action, _context) => {
    const start = Date.now();
    return {
      action_id: action.id,
      success: true,
      duration_ms: Date.now() - start,
      output: `Notification sent: ${action.description}`,
    };
  },

  custom: async (action, _context) => {
    const start = Date.now();
    return {
      action_id: action.id,
      success: true,
      duration_ms: Date.now() - start,
      output: `Custom action: ${action.description}`,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Action Builders
// ─────────────────────────────────────────────────────────────────────────────

export const ACTION_IDS = {
  RETRY_WITH_BACKOFF: "retry_with_backoff",
  RESTART_SERVICE: "restart_service",
  CLEAR_CACHE: "clear_cache",
  RESET_SESSION: "reset_session",
  RESTART_LEDGER: "restart_ledger",
  SWITCH_TO_MEMORY_LEDGER: "switch_to_memory_ledger",
  REFRESH_TOOL_REGISTRY: "refresh_tool_registry",
  RESTART_VOICE_COMPONENT: "restart_voice_component",
  RESET_VOICE_SESSION: "reset_voice_session",
  REFRESH_SESSION: "refresh_session",
  RE_AUTHENTICATE: "re_authenticate",
  BACKOFF: "backoff",
  RETRY_LATER: "retry_later",
  RESTART_ORCHESTRATOR: "restart_orchestrator",
  REVIEW_GATE_POLICY: "review_gate_policy",
  LOG_FOR_REVIEW: "log_for_review",
  NOTIFY: "notify",
} as const;

export function buildAction(id: string, type: RepairActionType, target?: Subsystem): RepairAction {
  return {
    id,
    type,
    description: `${type} action`,
    ...(target !== undefined && { target }),
  };
}

export function solutionToActions(solution: Solution): RepairAction[] {
  return solution.action_ids.map((actionId, index) => {
    const type = mapActionIdToType(actionId);
    return {
      id: `${solution.id}_action_${index}`,
      type,
      description: solution.description,
    };
  });
}

function mapActionIdToType(actionId: string): RepairActionType {
  switch (actionId) {
    case "restart_service":
      return "restart_service";
    case "clear_cache":
      return "clear_cache";
    case "reset_session":
      return "reset_session";
    case "restart_ledger":
    case "restart_orchestrator":
    case "restart_voice_component":
      return "restart_component";
    case "refresh_tool_registry":
      return "clear_cache";
    case "refresh_session":
    case "re_authenticate":
      return "reset_session";
    case "retry_with_backoff":
    case "retry_later":
    case "backoff":
      return "custom";
    case "review_gate_policy":
    case "log_for_review":
      return "notify";
    case "switch_to_memory_ledger":
      return "reconfigure";
    case "notify":
      return "notify";
    default:
      return "custom";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Repair Executor
// ─────────────────────────────────────────────────────────────────────────────

export class RepairExecutor {
  private rateLimiter: RateLimiter;
  private handlers: Map<RepairActionType, ActionHandler> = new Map();
  private rollbackStack: Map<string, RepairAction> = new Map();
  private ledgerAppend?: (
    event: Record<string, unknown>
  ) => Promise<{ event_id: string }>;

  constructor(maxPerMinute = 5, maxPerHour = 20) {
    this.rateLimiter = new RateLimiter(maxPerMinute, maxPerHour);
    for (const [type, handler] of Object.entries(DEFAULT_HANDLERS)) {
      this.handlers.set(type as RepairActionType, handler);
    }
  }

  setLedgerAppend(fn: (event: Record<string, unknown>) => Promise<{ event_id: string }>): void {
    this.ledgerAppend = fn;
  }

  registerHandler(type: RepairActionType, handler: ActionHandler): void {
    this.handlers.set(type, handler);
  }

  getRateLimitStats() {
    return this.rateLimiter.getStats();
  }

  canRepair(): boolean {
    return this.rateLimiter.canRepair();
  }

  async execute(
    diagnosis: Diagnosis,
    context: ActionContext
  ): Promise<RepairResult> {
    const repairId = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const startTime = Date.now();

    if (!this.canRepair()) {
      return {
        repair_id: repairId,
        diagnosis_id: diagnosis.id,
        actions: [],
        success: false,
        timestamp,
        escalated: true,
        total_duration_ms: Date.now() - startTime,
      };
    }

    this.rateLimiter.record();

    const actions: RepairActionResult[] = [];

    if (this.ledgerAppend) {
      this.ledgerAppend({
        event_type: VigilEventType.REPAIR_STARTED,
        repair_id: repairId,
        diagnosis_id: diagnosis.id,
        solutions: diagnosis.solutions.map((s) => s.id),
      }).catch(console.error);
    }

    for (const solution of diagnosis.solutions) {
      const repairActions = solutionToActions(solution);

      for (const action of repairActions) {
        if (action.rollback_id) {
          this.rollbackStack.set(action.id, {
            id: action.rollback_id,
            type: "rollback",
            description: `Rollback for ${action.id}`,
          });
        }

        const handler = this.handlers.get(action.type);
        if (!handler) {
          actions.push({
            action_id: action.id,
            success: false,
            duration_ms: 0,
            error: `No handler for action type: ${action.type}`,
          });
          continue;
        }

        const result = await handler(action, context);
        actions.push(result);

        if (!result.success && action.rollback_id) {
          const rollbackAction = this.rollbackStack.get(action.id);
          if (rollbackAction) {
            const rollbackHandler = this.handlers.get("rollback");
            if (rollbackHandler) {
              const rollbackResult = await rollbackHandler(rollbackAction, context);
              result.rolled_back = rollbackResult.success;
            }
          }
        }
      }

      const solutionSuccess = actions
        .slice(-repairActions.length)
        .every((a) => a.success);

      if (solutionSuccess) {
        break;
      }
    }

    const success = actions.some((a) => a.success);

    const result: RepairResult = {
      repair_id: repairId,
      diagnosis_id: diagnosis.id,
      actions,
      success,
      timestamp,
      escalated: false,
      total_duration_ms: Date.now() - startTime,
    };

    if (this.ledgerAppend) {
      this.ledgerAppend({
        event_type: success
          ? VigilEventType.REPAIR_COMPLETED
          : VigilEventType.REPAIR_FAILED,
        repair_id: repairId,
        diagnosis_id: diagnosis.id,
        result,
      }).catch(console.error);
    }

    return result;
  }
}
