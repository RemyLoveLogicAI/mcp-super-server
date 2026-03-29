/**
 * Founder Command Center - Canonical Event Schema
 * 
 * Shared event contract across:
 * - voice-command
 * - approval-gate
 * - vigil
 * - founder-command-center
 */

export type EventType =
  // Signal lifecycle
  | 'signal.received'
  | 'signal.classified'
  | 'signal.prioritized'
  
  // Task lifecycle
  | 'task.created'
  | 'task.assigned'
  | 'task.completed'
  
  // Approval lifecycle
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.denied'
  | 'approval.escalated'
  
  // Action lifecycle
  | 'action.proposed'
  | 'action.started'
  | 'action.succeeded'
  | 'action.failed'
  | 'action.blocked'
  
  // Vigil lifecycle
  | 'vigil.alerted'
  | 'vigil.diagnosed'
  | 'vigil.escalated'
  | 'vigil.resolved'
  
  // Brief lifecycle
  | 'brief.generated'
  | 'brief.delivered';

export type EventStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type Priority = 'critical' | 'high' | 'medium' | 'low';

export type SignalSource = 'email' | 'github' | 'drive' | 'voice' | 'manual';

export interface Event {
  id: string;                    // evt_YYYY_MM_DD_XXX
  timestamp: string;             // ISO 8601
  type: EventType;
  status: EventStatus;
  source: string;                // Module that emitted the event
  
  // Linkage
  input_ref?: string;            // ID of input event/artifact
  approval_ref?: string;         // ID of approval if required
  parent_event?: string;         // ID of parent event in chain
  
  // Payload
  payload: Record<string, unknown>;
  
  // Metadata
  confidence?: number;           // 0.0 - 1.0
  priority?: Priority;
  tags?: string[];
  
  // Result
  result?: string;
  error?: string;
}

export interface Signal {
  id: string;                    // sig_YYYY_MM_DD_XXX
  timestamp: string;
  source: SignalSource;
  raw: string;                   // Raw signal content
  classified?: {
    category: string;
    priority: Priority;
    summary: string;
  };
}

export interface Approval {
  id: string;                    // appr_YYYY_MM_DD_XXX
  timestamp: string;
  action_ref: string;            // ID of action requiring approval
  requested_by: string;
  status: 'pending' | 'approved' | 'denied' | 'escalated';
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  context: string;
  decision_reason?: string;
  decided_at?: string;
  decided_by?: string;
}

export interface Action {
  id: string;                    // act_YYYY_MM_DD_XXX
  timestamp: string;
  type: string;
  status: 'proposed' | 'approved' | 'running' | 'succeeded' | 'failed' | 'blocked';
  input_ref: string;
  approval_ref?: string;
  command: string;
  result?: string;
  error?: string;
}

export interface Receipt {
  id: string;                    // rcpt_YYYY_MM_DD_XXX
  timestamp: string;
  type: EventType;
  source: string;
  input_ref?: string;
  approval_ref?: string;
  result: string;
  confidence: number;
  status: 'success' | 'failure' | 'blocked';
  artifact_path?: string;
}

export interface DailyBrief {
  date: string;
  generated_at: string;
  signals_processed: number;
  actions_taken: number;
  actions_blocked: number;
  approvals_requested: number;
  approvals_granted: number;
  approvals_denied: number;
  vigil_alerts: number;
  top_priorities: Array<{
    id: string;
    summary: string;
    priority: Priority;
  }>;
  receipts: string[];           // Receipt IDs
}