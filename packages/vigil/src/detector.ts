/**
 * @mss/vigil — Error Detection
 */

import type {
  ErrorPattern,
  DetectedError,
  Subsystem,
} from "./types.js";
import { VigilEventType } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Built-in Error Patterns
// ─────────────────────────────────────────────────────────────────────────────

const BUILT_IN_PATTERNS: ErrorPattern[] = [
  {
    id: "timeout_error",
    pattern: /timeout|timed?\s*out|ETIMEDOUT|EHOSTUNREACH/i,
    description: "Network or service timeout",
    classification: {
      severity: "high",
      persistence: "transient",
      category: "network",
      recoverable: true,
    },
    recommended_actions: ["retry_with_backoff", "restart_service"],
  },
  {
    id: "connection_refused",
    pattern: /connection\s*refused|Econnrefused|ECONNREFUSED/i,
    description: "Connection refused by target",
    classification: {
      severity: "critical",
      persistence: "persistent",
      category: "network",
      recoverable: true,
    },
    recommended_actions: ["check_service_status", "restart_service"],
  },
  {
    id: "memory_exhausted",
    pattern: /out\s*of\s*memory|OOM|heap|memory\s*limit|javascript\s*heap/i,
    description: "Memory exhausted",
    classification: {
      severity: "critical",
      persistence: "persistent",
      category: "resource",
      recoverable: false,
    },
    recommended_actions: ["restart_service", "notify"],
  },
  {
    id: "invalid_state",
    pattern: /invalid\s*state|illegal\s*state|state\s*machine|FSM.*error/i,
    description: "Invalid state transition",
    classification: {
      severity: "high",
      persistence: "persistent",
      category: "logic",
      recoverable: true,
    },
    recommended_actions: ["reset_session", "restart_service"],
  },
  {
    id: "ledger_write_failure",
    pattern: /ledger.*write|append.*fail|cannot.*append/i,
    description: "Failed to write to event ledger",
    classification: {
      severity: "critical",
      persistence: "persistent",
      category: "persistence",
      recoverable: true,
    },
    recommended_actions: ["check_ledger_health", "restart_ledger"],
  },
  {
    id: "tool_not_found",
    pattern: /tool.*not\s*found|unknown\s*tool|tool.*unavailable/i,
    description: "Tool not found or unavailable",
    classification: {
      severity: "medium",
      persistence: "transient",
      category: "registry",
      recoverable: true,
    },
    recommended_actions: ["refresh_tool_registry"],
  },
  {
    id: "gate_denial",
    pattern: /gate.*denied|permission\s*denied|access\s*denied|unauthorized/i,
    description: "Tool gate denied the request",
    classification: {
      severity: "medium",
      persistence: "transient",
      category: "security",
      recoverable: false,
    },
    recommended_actions: ["notify", "review_gate_policy"],
  },
  {
    id: "voice_fsm_error",
    pattern: /voice.*FSM|ASR.*error|TTS.*fail|barge.*in.*fail|speech.*error/i,
    description: "Voice subsystem error",
    classification: {
      severity: "high",
      persistence: "transient",
      category: "voice",
      recoverable: true,
    },
    recommended_actions: ["reset_voice_session", "restart_voice_component"],
  },
  {
    id: "session_expired",
    pattern: /session.*expir|token.*expired|jwt.*expired|TTL.*exceeded/i,
    description: "Session or token has expired",
    classification: {
      severity: "medium",
      persistence: "transient",
      category: "auth",
      recoverable: true,
    },
    recommended_actions: ["refresh_session", "re_authenticate"],
  },
  {
    id: "rate_limit_exceeded",
    pattern: /rate\s*limit|too\s*many\s*requests|429|throttl/i,
    description: "Rate limit exceeded",
    classification: {
      severity: "medium",
      persistence: "transient",
      category: "rate_limit",
      recoverable: true,
    },
    recommended_actions: ["backoff", "retry_later"],
  },
  {
    id: "orchestrator_failure",
    pattern: /orchestrat.*fail|planning.*error|execution.*fail/i,
    description: "Orchestrator planning or execution failed",
    classification: {
      severity: "high",
      persistence: "persistent",
      category: "orchestration",
      recoverable: true,
    },
    recommended_actions: ["restart_orchestrator", "reset_session"],
  },
  {
    id: "validation_error",
    pattern: /validation.*fail|invalid.*input|schema.*mismatch|type.*error/i,
    description: "Input validation failed",
    classification: {
      severity: "medium",
      persistence: "persistent",
      category: "validation",
      recoverable: false,
    },
    recommended_actions: ["notify", "log_for_review"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Error Detector
// ─────────────────────────────────────────────────────────────────────────────

export class ErrorDetector {
  private patterns: Map<string, ErrorPattern> = new Map();
  private errors: Map<string, DetectedError> = new Map();
  private ledgerAppend?: (
    event: Record<string, unknown>
  ) => Promise<{ event_id: string }>;

  constructor(customPatterns: ErrorPattern[] = []) {
    for (const pattern of BUILT_IN_PATTERNS) {
      this.patterns.set(pattern.id, pattern);
    }
    for (const pattern of customPatterns) {
      this.patterns.set(pattern.id, pattern);
    }
  }

  setLedgerAppend(fn: (event: Record<string, unknown>) => Promise<{ event_id: string }>): void {
    this.ledgerAppend = fn;
  }

  detect(
    messages: string[],
    subsystem: Subsystem,
    context?: Record<string, unknown>
  ): DetectedError[] {
    const detected: DetectedError[] = [];

    for (const message of messages) {
      for (const pattern of this.patterns.values()) {
        const regex =
          typeof pattern.pattern === "string"
            ? new RegExp(pattern.pattern, "i")
            : pattern.pattern;

        if (regex.test(message)) {
          const key = `${pattern.id}:${subsystem}`;
          const existing = this.errors.get(key);

          if (existing) {
            existing.count++;
            existing.last_seen = new Date().toISOString();
            if (existing.message !== message) {
              existing.message = `${existing.message}; ${message}`;
            }
          } else {
            const error: DetectedError = {
              id: crypto.randomUUID(),
              pattern_id: pattern.id,
              message,
              timestamp: new Date().toISOString(),
              subsystem,
              severity: pattern.classification.severity,
              persistence: pattern.classification.persistence,
              count: 1,
              first_seen: new Date().toISOString(),
              last_seen: new Date().toISOString(),
              ...(context !== undefined && { context }),
            };
            this.errors.set(key, error);
            detected.push(error);
          }
        }
      }
    }

    if (this.ledgerAppend && detected.length > 0) {
      this.ledgerAppend({
        event_type: VigilEventType.ERROR_DETECTED,
        errors: detected,
        subsystem,
      }).catch(console.error);
    }

    return detected;
  }

  getActiveErrors(): DetectedError[] {
    const now = Date.now();
    const active: DetectedError[] = [];
    const windowMs = 600_000; // 10 minutes

    for (const error of this.errors.values()) {
      const ageMs = now - new Date(error.last_seen).getTime();
      if (ageMs < windowMs) {
        active.push(error);
      }
    }

    return active;
  }

  getErrorsBySubsystem(subsystem: Subsystem): DetectedError[] {
    const results: DetectedError[] = [];
    for (const error of this.errors.values()) {
      if (error.subsystem === subsystem) results.push(error);
    }
    return results;
  }

  getCriticalErrors(): DetectedError[] {
    const results: DetectedError[] = [];
    for (const error of this.errors.values()) {
      if (error.severity === "critical") results.push(error);
    }
    return results;
  }

  prune(maxAgeMs = 300_000): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, error] of this.errors.entries()) {
      const ageMs = now - new Date(error.last_seen).getTime();
      if (ageMs > maxAgeMs) {
        this.errors.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  addPattern(pattern: ErrorPattern): void {
    this.patterns.set(pattern.id, pattern);
  }

  getPattern(id: string): ErrorPattern | undefined {
    return this.patterns.get(id);
  }

  getPatterns(): ErrorPattern[] {
    return [...this.patterns.values()];
  }

  getErrorCount(): number {
    return this.errors.size;
  }
}
