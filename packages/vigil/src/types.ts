/**
 * @mss/vigil — VIGIL Self-Healing Layer Types
 */

import type { EventLedger } from "@mss/core/contracts";

// ─────────────────────────────────────────────────────────────────────────────
// Health Monitoring
// ─────────────────────────────────────────────────────────────────────────────

/** Subsystem targets for health monitoring */
export type Subsystem =
  | "server"
  | "voice_session"
  | "ledger"
  | "tool_registry"
  | "orchestrator"
  | "identity";

/** Health status of a single subsystem */
export interface SubsystemHealth {
  subsystem: Subsystem;
  healthy: boolean;
  latency_ms: number;
  message?: string;
  details?: Record<string, unknown>;
}

/** Overall health check result */
export interface HealthStatus {
  overall: "healthy" | "degraded" | "unhealthy";
  timestamp: string;
  checks: SubsystemHealth[];
  active_sessions?: number;
  error_rate?: number;
}

/** Configuration for the health monitor */
export interface HealthMonitorConfig {
  interval_ms?: number;
  history_window?: number;
  subsystems?: Subsystem[];
  timeout_ms?: number;
  onHealthChange?: (status: HealthStatus, prev: HealthStatus | null) => void;
  onUnhealthy?: (status: SubsystemHealth, subsystem: Subsystem) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Detection
// ─────────────────────────────────────────────────────────────────────────────

export type ErrorSeverity = "critical" | "high" | "medium" | "low";
export type ErrorPersistence = "transient" | "persistent" | "permanent";

export interface ErrorClassification {
  severity: ErrorSeverity;
  persistence: ErrorPersistence;
  category: string;
  recoverable: boolean;
}

export interface ErrorPattern {
  id: string;
  pattern: RegExp | string;
  description: string;
  classification: ErrorClassification;
  recommended_actions: string[];
}

export interface DetectedError {
  id: string;
  pattern_id: string;
  message: string;
  timestamp: string;
  subsystem: Subsystem;
  severity: ErrorSeverity;
  persistence: ErrorPersistence;
  count: number;
  first_seen: string;
  last_seen: string;
  context?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diagnosis
// ─────────────────────────────────────────────────────────────────────────────

export interface RootCause {
  id: string;
  description: string;
  confidence: number;
  evidence: string[];
  subsystem: Subsystem;
}

export interface Solution {
  id: string;
  description: string;
  action_ids: string[];
  impact_score: number;
  reversibility: number;
  risk_level: "low" | "medium" | "high";
  estimated_duration_ms: number;
}

export interface Diagnosis {
  id: string;
  error_id: string;
  timestamp: string;
  root_causes: RootCause[];
  solutions: Solution[];
  confidence: number;
  reasoning: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Repair Execution
// ─────────────────────────────────────────────────────────────────────────────

export type RepairActionType =
  | "restart_service"
  | "clear_cache"
  | "reset_session"
  | "rollback"
  | "reconfigure"
  | "restart_component"
  | "notify"
  | "custom";

export interface RepairAction {
  id: string;
  type: RepairActionType;
  description: string;
  target?: Subsystem;
  rollback_id?: string;
  params?: Record<string, unknown>;
  timeout_ms?: number;
}

export interface RepairActionResult {
  action_id: string;
  success: boolean;
  duration_ms: number;
  output?: unknown;
  error?: string;
  rolled_back?: boolean;
}

export interface RepairResult {
  repair_id: string;
  diagnosis_id: string;
  actions: RepairActionResult[];
  success: boolean;
  timestamp: string;
  escalated: boolean;
  total_duration_ms: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification
// ─────────────────────────────────────────────────────────────────────────────

export interface VerificationResult {
  verified: boolean;
  checks_passed: number;
  checks_failed: number;
  duration_ms: number;
  details?: Record<string, unknown>;
  alternatives?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Escalation
// ─────────────────────────────────────────────────────────────────────────────

export type EscalationPriority = "low" | "medium" | "high" | "critical";

export interface EscalationRequest {
  id: string;
  timestamp: string;
  priority: EscalationPriority;
  repair_id: string;
  diagnosis: Diagnosis;
  summary: string;
  actions_taken: string[];
  confidence: number;
  status: "pending" | "approved" | "rejected" | "timeout";
  response_deadline?: string;
}

export interface EscalationConfig {
  min_confidence_threshold?: number;
  max_auto_attempts?: number;
  response_timeout_ms?: number;
  notify_sms?: boolean;
  approval_gate_url?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Meta-Prompting
// ─────────────────────────────────────────────────────────────────────────────

export interface FixStrategy {
  id: string;
  description: string;
  actions: RepairAction[];
  confidence: number;
  chain_of_thought: string[];
  self_consistency_score?: number;
  alternatives?: FixStrategy[];
}

// ─────────────────────────────────────────────────────────────────────────────
// VIGIL Core
// ─────────────────────────────────────────────────────────────────────────────

export interface VigilConfig {
  health?: HealthMonitorConfig;
  escalation?: EscalationConfig;
  error_patterns?: ErrorPattern[];
  auto_repair_enabled?: boolean;
  max_repairs_per_minute?: number;
  max_repairs_per_hour?: number;
  ledger?: EventLedger;
}

export interface VigilStatus {
  running: boolean;
  health: HealthStatus | null;
  active_repairs: number;
  total_repairs: number;
  successful_repairs: number;
  failed_repairs: number;
  escalated_repairs: number;
  uptime_seconds: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// VIGIL Event Types (for ledger emission)
// ─────────────────────────────────────────────────────────────────────────────

export const VigilEventType = {
  HEALTH_CHECK: "VigilHealthCheck",
  ERROR_DETECTED: "VigilErrorDetected",
  DIAGNOSIS_COMPLETE: "VigilDiagnosisComplete",
  REPAIR_STARTED: "VigilRepairStarted",
  REPAIR_COMPLETED: "VigilRepairCompleted",
  REPAIR_FAILED: "VigilRepairFailed",
  ESCALATION_CREATED: "VigilEscalationCreated",
  ESCALATION_APPROVED: "VigilEscalationApproved",
  ESCALATION_REJECTED: "VigilEscalationRejected",
} as const;

export type VigilEventType = (typeof VigilEventType)[keyof typeof VigilEventType];
