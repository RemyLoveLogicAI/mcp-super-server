/**
 * Founder Command Center v1.1 — Policy-Controlled Execution Engine
 * 
 * PROOF 5: POLICY-CONTROLLED EXECUTION
 * 
 * System behavior controlled by explicit policy files.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

// ============================================================================
// TYPES (from schemas)
// ============================================================================

type Priority = 'critical' | 'high' | 'medium' | 'low';
type RiskLevel = 'critical' | 'high' | 'medium' | 'low';
type DecisionOutcome = 'execute' | 'approve_first' | 'block' | 'escalate' | 'defer' | 'discard';
type ActionStatus = 'pending' | 'queued' | 'executing' | 'succeeded' | 'failed' | 'blocked' | 'retrying' | 'dead_lettered';

interface Signal {
  id: string;
  schema_version: string;
  timestamp: string;
  type: string;
  source: string;
  payload: Record<string, unknown>;
  metadata: { confidence: number; tags?: string[] };
}

interface Decision {
  id: string;
  schema_version: string;
  timestamp: string;
  signal_id: string;
  outcome: DecisionOutcome;
  priority: Priority;
  reasoning: string;
  confidence: number;
  policy_version: string;
  requires_approval: boolean;
  approval_policy_ref?: string;
}

interface ApprovalRequest {
  id: string;
  schema_version: string;
  timestamp: string;
  decision_id: string;
  signal_id: string;
  risk_level: RiskLevel;
  summary: string;
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'escalated';
  policy_ref: string;
  policy_version: string;
}

interface ActionExecution {
  id: string;
  schema_version: string;
  timestamp: string;
  decision_id: string;
  approval_id?: string;
  signal_id: string;
  action_type: string;
  command: string;
  params: Record<string, unknown>;
  status: ActionStatus;
  idempotency_key: string;
  retry_count: number;
  max_retries: number;
  policy_version: string;
}

interface Receipt {
  id: string;
  schema_version: string;
  timestamp: string;
  type: string;
  status: 'success' | 'failed' | 'blocked' | 'deferred';
  confidence: number;
  signal_id: string;
  decision_id: string;
  approval_id?: string;
  action_id: string;
  policy_version: string;
  actor: string;
  result_ref: string;
  duration_ms: number;
}

// ============================================================================
// POLICY LOADER
// ============================================================================

interface ApprovalPolicyRule {
  id: string;
  name: string;
  condition: Record<string, unknown>;
  effect: {
    requires_approval: boolean;
    approval_type?: string;
    auto_deny?: boolean;
    auto_escalate?: boolean;
    escalate_on_timeout?: boolean;
    timeout_hours?: number;
    escalation_target?: string;
    auto_execute?: boolean;
  };
  enabled: boolean;
}

interface RoutingPolicyRule {
  id: string;
  name: string;
  condition: Record<string, unknown>;
  priority: Priority;
  route_to: string;
}

interface ConfidencePolicy {
  thresholds: {
    auto_execute: { min_confidence: number; additional_requirements: Record<string, unknown> };
    escalate_for_review: { max_confidence: number };
    block_execution: { conditions: Array<{ confidence?: Record<string, number>; priority?: string; action: string; reason: string }> };
  };
}

class PolicyLoader {
  private policiesPath: string;
  
  approvalPolicies: { policy_version: string; rules: ApprovalPolicyRule[]; fallback_policy: { requires_approval: boolean } } | null = null;
  routingPolicies: { policy_version: string; priority_rules: RoutingPolicyRule[]; fallback_priority: Priority } | null = null;
  confidencePolicies: ConfidencePolicy | null = null;
  
  constructor(policiesPath: string) {
    this.policiesPath = policiesPath;
  }
  
  loadAll(): void {
    this.approvalPolicies = this.loadJSON('approval_policies.json');
    this.routingPolicies = this.loadJSON('routing_policies.json');
    this.confidencePolicies = this.loadJSON('confidence_policies.json');
  }
  
  private loadJSON(filename: string): unknown {
    const filepath = path.join(this.policiesPath, filename);
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
    throw new Error(`Policy file not found: ${filename}`);
  }
  
  get policyVersion(): string {
    return this.approvalPolicies?.policy_version || 'unknown';
  }
}

// ============================================================================
// POLICY ENGINE
// ============================================================================

class PolicyEngine {
  private loader: PolicyLoader;
  
  constructor(loader: PolicyLoader) {
    this.loader = loader;
  }
  
  determinePriority(signal: Signal): Priority {
    const rules = this.loader.routingPolicies?.priority_rules || [];
    
    for (const rule of rules) {
      if (this.matchesCondition(signal, rule.condition)) {
        return rule.priority;
      }
    }
    
    return this.loader.routingPolicies?.fallback_priority || 'medium';
  }
  
  assessRisk(signal: Signal, priority: Priority): RiskLevel {
    // Risk assessment based on signal type and priority
    if (priority === 'critical') return 'critical';
    if (priority === 'high') return 'high';
    if (signal.type.includes('urgent') || signal.type.includes('failed')) return 'high';
    if (signal.type.includes('email') || signal.type.includes('post')) return 'medium';
    return 'low';
  }
  
  adjustConfidence(signal: Signal): number {
    let confidence = signal.metadata.confidence;
    
    // Apply source reliability adjustment
    const sourceWeights: Record<string, number> = {
      gmail: 1.0,
      github: 0.95,
      gdrive: 0.85,
      internal: 0.90
    };
    
    const weight = sourceWeights[signal.source] || 0.9;
    confidence = confidence * weight;
    
    // Clamp to valid range
    return Math.max(0, Math.min(1, confidence));
  }
  
  evaluateApprovalRequirement(signal: Signal, priority: Priority, confidence: number): {
    requiresApproval: boolean;
    autoDeny: boolean;
    autoEscalate: boolean;
    policyRef: string;
  } {
    const rules = this.loader.approvalPolicies?.rules || [];
    const riskLevel = this.assessRisk(signal, priority);
    
    for (const rule of rules) {
      if (!rule.enabled) continue;
      
      const condition = rule.condition;
      
      // Check priority match
      if (condition.priority && !this.matchesValue(priority, condition.priority)) continue;
      
      // Check risk level match
      if (condition.risk_level && !this.matchesValue(riskLevel, condition.risk_level)) continue;
      
      // Check confidence condition
      if (condition.confidence) {
        const confCond = condition.confidence as { lt?: number; gte?: number };
        if (confCond.lt && confidence >= confCond.lt) continue;
        if (confCond.gte && confidence < confCond.gte) continue;
      }
      
      // Rule matches
      return {
        requiresApproval: rule.effect.requires_approval,
        autoDeny: rule.effect.auto_deny || false,
        autoEscalate: rule.effect.auto_escalate || false,
        policyRef: rule.id
      };
    }
    
    // Fallback
    const fallback = this.loader.approvalPolicies?.fallback_policy;
    return {
      requiresApproval: fallback?.requires_approval ?? true,
      autoDeny: false,
      autoEscalate: false,
      policyRef: 'fallback'
    };
  }
  
  determineOutcome(
    signal: Signal,
    priority: Priority,
    confidence: number,
    approvalInfo: { requiresApproval: boolean; autoDeny: boolean; autoEscalate: boolean }
  ): DecisionOutcome {
    // Low confidence always escalates
    const escalateThreshold = this.loader.confidencePolicies?.thresholds.escalate_for_review.max_confidence ?? 0.6;
    if (confidence < escalateThreshold) {
      return 'escalate';
    }
    
    // Critical priority with auto-deny
    if (approvalInfo.autoDeny && priority === 'critical') {
      return 'block';
    }
    
    // Auto-escalate flag
    if (approvalInfo.autoEscalate) {
      return 'escalate';
    }
    
    // Requires approval first
    if (approvalInfo.requiresApproval) {
      return 'approve_first';
    }
    
    // Safe to execute
    return 'execute';
  }
  
  private matchesCondition(signal: Signal, condition: Record<string, unknown>): boolean {
    for (const [key, value] of Object.entries(condition)) {
      if (key === 'type') {
        if (!this.matchesValue(signal.type, value)) return false;
      } else if (key === 'source') {
        if (!this.matchesValue(signal.source, value)) return false;
      }
    }
    return true;
  }
  
  private matchesValue(actual: string, expected: unknown): boolean {
    if (Array.isArray(expected)) {
      return expected.includes(actual);
    }
    return actual === expected;
  }
}

// ============================================================================
// EVENT STORE
// ============================================================================

class EventStore {
  private basePath: string;
  
  constructor(basePath: string) {
    this.basePath = basePath;
  }
  
  appendEvent(event: unknown, filename: string): void {
    const filepath = path.join(this.basePath, filename);
    fs.appendFileSync(filepath, JSON.stringify(event) + '\n');
  }
  
  generateId(prefix: string): string {
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}_${timestamp}_${random}`;
  }
  
  generateIdempotencyKey(signalId: string, actionType: string): string {
    return createHash('sha256').update(`${signalId}:${actionType}`).digest('hex').slice(0, 16);
  }
}

// ============================================================================
// GOVERNED EXECUTION ENGINE
// ============================================================================

export class GovernedExecutionEngine {
  private policyLoader: PolicyLoader;
  private policyEngine: PolicyEngine;
  private eventStore: EventStore;
  private basePath: string;
  
  constructor(basePath: string) {
    this.basePath = basePath;
    this.policyLoader = new PolicyLoader(path.join(basePath, 'policies'));
    this.policyEngine = new PolicyEngine(this.policyLoader);
    this.eventStore = new EventStore(basePath);
    
    this.policyLoader.loadAll();
  }
  
  get policyVersion(): string {
    return this.policyLoader.policyVersion;
  }
  
  async processSignal(signal: Signal): Promise<{
    decision: Decision;
    approval?: ApprovalRequest;
    action: ActionExecution;
    receipt: Receipt;
  }> {
    const startTime = Date.now();
    
    // 1. Adjust confidence based on policy
    const confidence = this.policyEngine.adjustConfidence(signal);
    
    // 2. Determine priority from routing policy
    const priority = this.policyEngine.determinePriority(signal);
    
    // 3. Evaluate approval requirements
    const approvalInfo = this.policyEngine.evaluateApprovalRequirement(signal, priority, confidence);
    
    // 4. Determine outcome
    const outcome = this.policyEngine.determineOutcome(signal, priority, confidence, approvalInfo);
    
    // 5. Create decision
    const decision: Decision = {
      id: this.eventStore.generateId('dec'),
      schema_version: '1.1.0',
      timestamp: new Date().toISOString(),
      signal_id: signal.id,
      outcome,
      priority,
      reasoning: this.generateReasoning(outcome, priority, confidence, approvalInfo),
      confidence,
      policy_version: this.policyVersion,
      requires_approval: approvalInfo.requiresApproval,
      approval_policy_ref: approvalInfo.policyRef
    };
    
    this.eventStore.appendEvent(decision, 'events/events.jsonl');
    
    // 6. Create approval if required
    let approval: ApprovalRequest | undefined;
    if (outcome === 'approve_first') {
      approval = {
        id: this.eventStore.generateId('appr'),
        schema_version: '1.1.0',
        timestamp: new Date().toISOString(),
        decision_id: decision.id,
        signal_id: signal.id,
        risk_level: this.policyEngine.assessRisk(signal, priority),
        summary: `Approval required for ${signal.type} from ${signal.source}`,
        status: 'pending',
        policy_ref: approvalInfo.policyRef,
        policy_version: this.policyVersion
      };
      
      this.eventStore.appendEvent(approval, 'approvals/approvals.jsonl');
    }
    
    // 7. Create action
    const actionStatus: ActionStatus = outcome === 'block' ? 'blocked' : 
                                        outcome === 'escalate' ? 'pending' :
                                        outcome === 'approve_first' ? 'pending' :
                                        'succeeded';
    
    const action: ActionExecution = {
      id: this.eventStore.generateId('act'),
      schema_version: '1.1.0',
      timestamp: new Date().toISOString(),
      decision_id: decision.id,
      approval_id: approval?.id,
      signal_id: signal.id,
      action_type: this.determineActionType(signal, outcome),
      command: this.generateCommand(signal, outcome),
      params: signal.payload,
      status: actionStatus,
      idempotency_key: this.eventStore.generateIdempotencyKey(signal.id, signal.type),
      retry_count: 0,
      max_retries: 3,
      policy_version: this.policyVersion
    };
    
    this.eventStore.appendEvent(action, 'actions/actions.jsonl');
    
    // 8. Create receipt
    const receipt: Receipt = {
      id: this.eventStore.generateId('rcpt'),
      schema_version: '1.1.0',
      timestamp: new Date().toISOString(),
      type: `action.${actionStatus}`,
      status: actionStatus === 'succeeded' ? 'success' : 
              actionStatus === 'blocked' ? 'blocked' : 'deferred',
      confidence,
      signal_id: signal.id,
      decision_id: decision.id,
      approval_id: approval?.id,
      action_id: action.id,
      policy_version: this.policyVersion,
      actor: 'founder-command-center',
      result_ref: `actions.jsonl#${action.id}`,
      duration_ms: Date.now() - startTime
    };
    
    this.eventStore.appendEvent(receipt, 'receipts/receipts.jsonl');
    
    return { decision, approval, action, receipt };
  }
  
  private generateReasoning(
    outcome: DecisionOutcome,
    priority: Priority,
    confidence: number,
    approvalInfo: { requiresApproval: boolean; autoDeny: boolean; policyRef: string }
  ): string {
    const reasons: string[] = [];
    
    reasons.push(`Priority: ${priority}`);
    reasons.push(`Confidence: ${(confidence * 100).toFixed(1)}%`);
    
    if (approvalInfo.requiresApproval) {
      reasons.push(`Approval required by policy ${approvalInfo.policyRef}`);
    }
    
    if (approvalInfo.autoDeny) {
      reasons.push('Auto-deny policy triggered');
    }
    
    if (outcome === 'block') {
      reasons.push('Blocked due to policy constraints');
    } else if (outcome === 'escalate') {
      reasons.push('Escalated for human review');
    } else if (outcome === 'approve_first') {
      reasons.push('Awaiting approval before execution');
    } else {
      reasons.push('Safe to execute automatically');
    }
    
    return reasons.join('. ');
  }
  
  private determineActionType(signal: Signal, outcome: DecisionOutcome): string {
    if (outcome === 'block') return 'action.blocked';
    if (outcome === 'escalate') return 'escalate';
    
    const actionMap: Record<string, string> = {
      'email.received': 'create.task',
      'email.urgent': 'send.notification',
      'github.pr.created': 'create.task',
      'github.workflow.failed': 'escalate',
      'drive.file.created': 'create.document'
    };
    
    return actionMap[signal.type] || 'execute.command';
  }
  
  private generateCommand(signal: Signal, outcome: DecisionOutcome): string {
    if (outcome === 'block') return 'block --reason policy';
    if (outcome === 'escalate') return 'escalate --target human-review';
    
    return `process_${signal.type.replace('.', '_')} --source ${signal.source}`;
  }
}