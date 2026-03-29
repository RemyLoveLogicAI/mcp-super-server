/**
 * @mss/vigil — Diagnosis Engine
 */

import type {
  DetectedError,
  RootCause,
  Solution,
  Diagnosis,
  Subsystem,
} from "./types.js";
import { VigilEventType } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Knowledge Base Entry
// ─────────────────────────────────────────────────────────────────────────────

interface KnowledgeBaseEntry {
  pattern_id: string;
  root_causes: Array<{
    description: string;
    confidence: number;
    evidence: string[];
    subsystem: Subsystem;
  }>;
  solutions: Array<{
    description: string;
    action_ids: string[];
    impact_score: number;
    reversibility: number;
    risk_level: "low" | "medium" | "high";
    estimated_duration_ms: number;
  }>;
  default_confidence: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Built-in Knowledge Base
// ─────────────────────────────────────────────────────────────────────────────

const KNOWLEDGE_BASE: KnowledgeBaseEntry[] = [
  {
    pattern_id: "timeout_error",
    root_causes: [
      {
        description: "Service is overloaded and responding slowly",
        confidence: 0.7,
        evidence: ["high latency", "timeout pattern"],
        subsystem: "server",
      },
      {
        description: "Network connectivity issues",
        confidence: 0.6,
        evidence: ["timeout pattern", "intermittent failures"],
        subsystem: "server",
      },
    ],
    solutions: [
      {
        description: "Retry with exponential backoff",
        action_ids: ["retry_with_backoff"],
        impact_score: 0.8,
        reversibility: 1.0,
        risk_level: "low",
        estimated_duration_ms: 5000,
      },
      {
        description: "Restart the affected service",
        action_ids: ["restart_service"],
        impact_score: 0.9,
        reversibility: 0.8,
        risk_level: "medium",
        estimated_duration_ms: 30_000,
      },
    ],
    default_confidence: 0.65,
  },
  {
    pattern_id: "connection_refused",
    root_causes: [
      {
        description: "Service process is not running",
        confidence: 0.85,
        evidence: ["connection refused", "service unavailable"],
        subsystem: "server",
      },
      {
        description: "Service port is blocked by firewall",
        confidence: 0.4,
        evidence: ["connection refused", "firewall rules"],
        subsystem: "server",
      },
    ],
    solutions: [
      {
        description: "Start or restart the service",
        action_ids: ["restart_service"],
        impact_score: 0.95,
        reversibility: 0.8,
        risk_level: "medium",
        estimated_duration_ms: 30_000,
      },
    ],
    default_confidence: 0.75,
  },
  {
    pattern_id: "memory_exhausted",
    root_causes: [
      {
        description: "Memory leak in the service process",
        confidence: 0.8,
        evidence: ["OOM", "heap exhaustion", "gradual degradation"],
        subsystem: "server",
      },
      {
        description: "Workload exceeds available memory",
        confidence: 0.6,
        evidence: ["OOM", "sudden spike"],
        subsystem: "server",
      },
    ],
    solutions: [
      {
        description: "Restart the service to clear memory",
        action_ids: ["restart_service"],
        impact_score: 0.95,
        reversibility: 0.7,
        risk_level: "medium",
        estimated_duration_ms: 30_000,
      },
      {
        description: "Clear internal caches",
        action_ids: ["clear_cache"],
        impact_score: 0.5,
        reversibility: 1.0,
        risk_level: "low",
        estimated_duration_ms: 5000,
      },
    ],
    default_confidence: 0.7,
  },
  {
    pattern_id: "invalid_state",
    root_causes: [
      {
        description: "FSM received unexpected event sequence",
        confidence: 0.75,
        evidence: ["invalid state", "state machine error"],
        subsystem: "voice_session",
      },
      {
        description: "Session data corruption",
        confidence: 0.5,
        evidence: ["invalid state", "corrupted session"],
        subsystem: "voice_session",
      },
    ],
    solutions: [
      {
        description: "Reset the voice session to idle",
        action_ids: ["reset_session"],
        impact_score: 0.8,
        reversibility: 0.9,
        risk_level: "low",
        estimated_duration_ms: 1000,
      },
      {
        description: "Restart the voice component",
        action_ids: ["restart_voice_component"],
        impact_score: 0.9,
        reversibility: 0.7,
        risk_level: "medium",
        estimated_duration_ms: 15_000,
      },
    ],
    default_confidence: 0.65,
  },
  {
    pattern_id: "ledger_write_failure",
    root_causes: [
      {
        description: "Ledger backend is unavailable",
        confidence: 0.85,
        evidence: ["ledger write failure", "backend error"],
        subsystem: "ledger",
      },
      {
        description: "Ledger storage quota exceeded",
        confidence: 0.4,
        evidence: ["quota exceeded", "write rejected"],
        subsystem: "ledger",
      },
    ],
    solutions: [
      {
        description: "Restart the ledger service",
        action_ids: ["restart_ledger"],
        impact_score: 0.9,
        reversibility: 0.8,
        risk_level: "medium",
        estimated_duration_ms: 20_000,
      },
      {
        description: "Switch to in-memory ledger temporarily",
        action_ids: ["switch_to_memory_ledger"],
        impact_score: 0.7,
        reversibility: 0.9,
        risk_level: "high",
        estimated_duration_ms: 5000,
      },
    ],
    default_confidence: 0.7,
  },
  {
    pattern_id: "tool_not_found",
    root_causes: [
      {
        description: "Tool was unregistered but still called",
        confidence: 0.7,
        evidence: ["tool not found", "missing registration"],
        subsystem: "tool_registry",
      },
      {
        description: "Tool registry is out of sync",
        confidence: 0.5,
        evidence: ["tool not found", "registry inconsistency"],
        subsystem: "tool_registry",
      },
    ],
    solutions: [
      {
        description: "Refresh and re-register tools",
        action_ids: ["refresh_tool_registry"],
        impact_score: 0.8,
        reversibility: 1.0,
        risk_level: "low",
        estimated_duration_ms: 5000,
      },
    ],
    default_confidence: 0.6,
  },
  {
    pattern_id: "voice_fsm_error",
    root_causes: [
      {
        description: "ASR provider returned an error",
        confidence: 0.65,
        evidence: ["ASR error", "speech processing failed"],
        subsystem: "voice_session",
      },
      {
        description: "TTS provider is unavailable",
        confidence: 0.5,
        evidence: ["TTS fail", "provider error"],
        subsystem: "voice_session",
      },
    ],
    solutions: [
      {
        description: "Reset the voice session",
        action_ids: ["reset_voice_session"],
        impact_score: 0.7,
        reversibility: 0.9,
        risk_level: "low",
        estimated_duration_ms: 1000,
      },
      {
        description: "Restart voice component",
        action_ids: ["restart_voice_component"],
        impact_score: 0.9,
        reversibility: 0.7,
        risk_level: "medium",
        estimated_duration_ms: 15_000,
      },
    ],
    default_confidence: 0.6,
  },
  {
    pattern_id: "session_expired",
    root_causes: [
      {
        description: "Session TTL exceeded",
        confidence: 0.9,
        evidence: ["session expired", "TTL exceeded"],
        subsystem: "server",
      },
    ],
    solutions: [
      {
        description: "Create a new session",
        action_ids: ["refresh_session"],
        impact_score: 0.9,
        reversibility: 1.0,
        risk_level: "low",
        estimated_duration_ms: 1000,
      },
    ],
    default_confidence: 0.85,
  },
  {
    pattern_id: "rate_limit_exceeded",
    root_causes: [
      {
        description: "Too many requests in short window",
        confidence: 0.9,
        evidence: ["rate limit", "429", "throttle"],
        subsystem: "server",
      },
    ],
    solutions: [
      {
        description: "Apply backoff and retry later",
        action_ids: ["backoff"],
        impact_score: 0.8,
        reversibility: 1.0,
        risk_level: "low",
        estimated_duration_ms: 1000,
      },
    ],
    default_confidence: 0.85,
  },
  {
    pattern_id: "orchestrator_failure",
    root_causes: [
      {
        description: "Orchestrator planning failed due to invalid state",
        confidence: 0.7,
        evidence: ["orchestrator fail", "planning error"],
        subsystem: "orchestrator",
      },
      {
        description: "Orchestrator execution failed",
        confidence: 0.7,
        evidence: ["orchestrator fail", "execution fail"],
        subsystem: "orchestrator",
      },
    ],
    solutions: [
      {
        description: "Restart the orchestrator",
        action_ids: ["restart_orchestrator"],
        impact_score: 0.9,
        reversibility: 0.8,
        risk_level: "medium",
        estimated_duration_ms: 20_000,
      },
      {
        description: "Reset the session",
        action_ids: ["reset_session"],
        impact_score: 0.7,
        reversibility: 0.9,
        risk_level: "low",
        estimated_duration_ms: 1000,
      },
    ],
    default_confidence: 0.65,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Diagnosis Engine
// ─────────────────────────────────────────────────────────────────────────────

export class DiagnosisEngine {
  private knowledgeBase: Map<string, KnowledgeBaseEntry> = new Map();
  private ledgerAppend?: (
    event: Record<string, unknown>
  ) => Promise<{ event_id: string }>;

  constructor() {
    for (const entry of KNOWLEDGE_BASE) {
      this.knowledgeBase.set(entry.pattern_id, entry);
    }
  }

  setLedgerAppend(fn: (event: Record<string, unknown>) => Promise<{ event_id: string }>): void {
    this.ledgerAppend = fn;
  }

  addKnowledge(entry: KnowledgeBaseEntry): void {
    this.knowledgeBase.set(entry.pattern_id, entry);
  }

  diagnose(error: DetectedError): Diagnosis {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const entry = this.knowledgeBase.get(error.pattern_id);

    let rootCauses: RootCause[];
    let solutions: Solution[];
    let confidence: number;

    if (entry) {
      rootCauses = entry.root_causes.map((rc) => ({
        id: crypto.randomUUID(),
        description: rc.description,
        confidence: rc.confidence,
        evidence: rc.evidence,
        subsystem: rc.subsystem,
      }));
      solutions = entry.solutions.map((s) => ({
        id: crypto.randomUUID(),
        description: s.description,
        action_ids: s.action_ids,
        impact_score: s.impact_score,
        reversibility: s.reversibility,
        risk_level: s.risk_level,
        estimated_duration_ms: s.estimated_duration_ms,
      }));
      confidence = entry.default_confidence;

      if (error.count > 5) confidence = Math.min(0.95, confidence + 0.1);
      if (error.count === 1) confidence = Math.max(0.4, confidence - 0.15);
    } else {
      rootCauses = [
        {
          id: crypto.randomUUID(),
          description: "Unknown root cause — requires manual investigation",
          confidence: 0.3,
          evidence: [error.message],
          subsystem: error.subsystem,
        },
      ];
      solutions = [
        {
          id: crypto.randomUUID(),
          description: "Collect more information and notify operator",
          action_ids: ["notify"],
          impact_score: 0.5,
          reversibility: 1.0,
          risk_level: "low",
          estimated_duration_ms: 1000,
        },
      ];
      confidence = 0.3;
    }

    solutions.sort((a, b) => {
      const scoreA = a.impact_score * a.reversibility;
      const scoreB = b.impact_score * b.reversibility;
      return scoreB - scoreA;
    });

    const diagnosis: Diagnosis = {
      id,
      error_id: error.id,
      timestamp,
      root_causes: rootCauses,
      solutions,
      confidence,
      reasoning: this.buildReasoning(error, entry),
    };

    if (this.ledgerAppend) {
      this.ledgerAppend({
        event_type: VigilEventType.DIAGNOSIS_COMPLETE,
        diagnosis,
        error_id: error.id,
      }).catch(console.error);
    }

    return diagnosis;
  }

  private buildReasoning(error: DetectedError, entry: KnowledgeBaseEntry | undefined): string {
    const lines: string[] = [];

    lines.push(`Analyzing error: "${error.message}" (${error.count} occurrences)`);
    lines.push(`Subsystem: ${error.subsystem}, Severity: ${error.severity}`);

    if (entry) {
      lines.push(`Matched pattern: ${error.pattern_id}`);
      lines.push(`Likely root causes (${entry.root_causes.length}):`);
      for (const rc of entry.root_causes) {
        lines.push(`  - ${rc.description} (confidence: ${rc.confidence})`);
      }
      lines.push(`Recommended solutions (${entry.solutions.length}):`);
      for (const s of entry.solutions) {
        lines.push(`  - ${s.description} [risk: ${s.risk_level}, impact: ${s.impact_score}]`);
      }
    } else {
      lines.push("No known pattern matched — escalation recommended.");
    }

    return lines.join("\n");
  }

  getKnowledge(patternId: string): KnowledgeBaseEntry | undefined {
    return this.knowledgeBase.get(patternId);
  }
}
