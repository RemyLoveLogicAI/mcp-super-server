/**
 * Founder Command Center - Core Engine
 * 
 * Governed execution loop:
 * Signal → Decision → Approval → Action → Receipt → Brief
 */

import * as fs from 'fs';
import * as path from 'path';

// Types
type EventType = string;
type EventStatus = 'pending' | 'processing' | 'completed' | 'failed';
type Priority = 'critical' | 'high' | 'medium' | 'low';
type SignalSource = 'email' | 'github' | 'drive' | 'voice' | 'manual';

interface Event {
  id: string;
  timestamp: string;
  type: EventType;
  status: EventStatus;
  source: string;
  input_ref?: string;
  approval_ref?: string;
  payload: Record<string, unknown>;
  confidence?: number;
  priority?: Priority;
  result?: string;
  error?: string;
}

interface Signal {
  id: string;
  timestamp: string;
  source: SignalSource;
  raw: string;
  classified?: {
    category: string;
    priority: Priority;
    summary: string;
  };
}

interface Approval {
  id: string;
  timestamp: string;
  action_ref: string;
  status: 'pending' | 'approved' | 'denied' | 'escalated';
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  context: string;
  decision_reason?: string;
}

interface Action {
  id: string;
  timestamp: string;
  type: string;
  status: 'proposed' | 'approved' | 'running' | 'succeeded' | 'failed' | 'blocked';
  input_ref: string;
  command: string;
  result?: string;
}

interface Receipt {
  id: string;
  timestamp: string;
  type: EventType;
  source: string;
  input_ref?: string;
  approval_ref?: string;
  result: string;
  confidence: number;
  status: 'success' | 'failure' | 'blocked';
}

// Utilities
function generateId(prefix: string): string {
  const now = new Date();
  const date = now.toISOString().split('T')[0].replace(/-/g, '_');
  const seq = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `${prefix}_${date}_${seq}`;
}

function timestamp(): string {
  return new Date().toISOString();
}

function writeJSON(dir: string, filename: string, data: unknown): void {
  const dirPath = path.join('/home/workspace/founder-command-center', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  fs.writeFileSync(path.join(dirPath, filename), JSON.stringify(data, null, 2));
}

function appendJSONL(dir: string, filename: string, data: unknown): void {
  const dirPath = path.join('/home/workspace/founder-command-center', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  fs.appendFileSync(path.join(dirPath, filename), JSON.stringify(data) + '\n');
}

// Core Classes

export class SignalIngestor {
  private sources: SignalSource[] = ['email', 'github', 'drive'];
  
  ingest(raw: string, source: SignalSource): Signal {
    const signal: Signal = {
      id: generateId('sig'),
      timestamp: timestamp(),
      source,
      raw
    };
    
    appendJSONL('signals', 'inbox.jsonl', signal);
    
    return signal;
  }
  
  classify(signal: Signal): Event {
    const classification = this.detectCategory(signal.raw);
    const priority = this.detectPriority(signal.raw, classification);
    
    signal.classified = {
      category: classification,
      priority,
      summary: signal.raw.substring(0, 100)
    };
    
    const event: Event = {
      id: generateId('evt'),
      timestamp: timestamp(),
      type: 'signal.classified',
      status: 'completed',
      source: 'signal-ingestor',
      input_ref: signal.id,
      payload: { signal },
      confidence: 0.85,
      priority
    };
    
    appendJSONL('events', 'events.jsonl', event);
    
    return event;
  }
  
  private detectCategory(raw: string): string {
    if (raw.toLowerCase().includes('pr') || raw.toLowerCase().includes('commit')) {
      return 'development';
    }
    if (raw.toLowerCase().includes('email') || raw.toLowerCase().includes('message')) {
      return 'communication';
    }
    if (raw.toLowerCase().includes('doc') || raw.toLowerCase().includes('drive')) {
      return 'documentation';
    }
    return 'general';
  }
  
  private detectPriority(raw: string, category: string): Priority {
    const lower = raw.toLowerCase();
    
    if (lower.includes('urgent') || lower.includes('critical') || lower.includes('asap')) {
      return 'critical';
    }
    if (lower.includes('important') || lower.includes('high') || category === 'development') {
      return 'high';
    }
    if (lower.includes('medium') || category === 'communication') {
      return 'medium';
    }
    return 'low';
  }
}

export class ApprovalGate {
  private requiresApproval = ['critical', 'high'];
  
  requestApproval(action: Action, context: string): Approval {
    const riskLevel = this.assessRisk(action);
    
    const approval: Approval = {
      id: generateId('appr'),
      timestamp: timestamp(),
      action_ref: action.id,
      status: 'pending',
      risk_level: riskLevel,
      context
    };
    
    appendJSONL('approvals', 'approvals.jsonl', approval);
    
    return approval;
  }
  
  decide(approvalId: string, approved: boolean, reason: string): Approval | null {
    const approvalsPath = '/home/workspace/founder-command-center/approvals/approvals.jsonl';
    if (!fs.existsSync(approvalsPath)) return null;
    
    const lines = fs.readFileSync(approvalsPath, 'utf-8').split('\n').filter(Boolean);
    let approval: Approval | null = null;
    
    for (const line of lines) {
      const a = JSON.parse(line) as Approval;
      if (a.id === approvalId) {
        a.status = approved ? 'approved' : 'denied';
        a.decision_reason = reason;
        a.decided_at = timestamp();
        approval = a;
        break;
      }
    }
    
    if (approval) {
      // Rewrite file with updated approval
      const updated = lines.map(l => {
        const a = JSON.parse(l);
        return a.id === approvalId ? JSON.stringify(approval) : l;
      }).join('\n');
      fs.writeFileSync(approvalsPath, updated + '\n');
    }
    
    return approval;
  }
  
  needsApproval(priority: Priority): boolean {
    return this.requiresApproval.includes(priority);
  }
  
  private assessRisk(action: Action): 'low' | 'medium' | 'high' | 'critical' {
    if (action.command.includes('delete') || action.command.includes('remove')) {
      return 'critical';
    }
    if (action.command.includes('publish') || action.command.includes('deploy')) {
      return 'high';
    }
    if (action.command.includes('write') || action.command.includes('update')) {
      return 'medium';
    }
    return 'low';
  }
}

export class ActionExecutor {
  propose(signal: Signal, classified: { priority: Priority }): Action {
    const command = this.generateCommand(signal);
    
    const action: Action = {
      id: generateId('act'),
      timestamp: timestamp(),
      type: 'proposed',
      status: 'proposed',
      input_ref: signal.id,
      command
    };
    
    appendJSONL('actions', 'actions.jsonl', action);
    
    return action;
  }
  
  execute(action: Action, approved: boolean): Action {
    if (!approved) {
      action.status = 'blocked';
      action.result = 'Action blocked - approval denied';
      return action;
    }
    
    action.status = 'running';
    
    // Simulate execution
    try {
      const result = this.runCommand(action.command);
      action.status = 'succeeded';
      action.result = result;
    } catch (error) {
      action.status = 'failed';
      action.result = `Error: ${error}`;
    }
    
    // Update action file
    const actionsPath = '/home/workspace/founder-command-center/actions/actions.jsonl';
    if (fs.existsSync(actionsPath)) {
      const lines = fs.readFileSync(actionsPath, 'utf-8').split('\n').filter(Boolean);
      const updated = lines.map(l => {
        const a = JSON.parse(l);
        return a.id === action.id ? JSON.stringify(action) : l;
      }).join('\n');
      fs.writeFileSync(actionsPath, updated + '\n');
    }
    
    return action;
  }
  
  private generateCommand(signal: Signal): string {
    return `process_signal --source ${signal.source} --id ${signal.id}`;
  }
  
  private runCommand(command: string): string {
    // Simulate command execution
    return `Executed: ${command}`;
  }
}

export class ReceiptLedger {
  write(event: Event, status: 'success' | 'failure' | 'blocked'): Receipt {
    const receipt: Receipt = {
      id: generateId('rcpt'),
      timestamp: timestamp(),
      type: event.type,
      source: event.source,
      input_ref: event.input_ref,
      approval_ref: event.approval_ref,
      result: event.result || 'No result recorded',
      confidence: event.confidence || 0.8,
      status
    };
    
    appendJSONL('receipts', 'receipts.jsonl', receipt);
    
    return receipt;
  }
}

export class DailyBriefGenerator {
  generate(): { brief: object; path: string } {
    const today = new Date().toISOString().split('T')[0];
    
    // Load events, approvals, actions, receipts
    const events = this.loadJSONL('events/events.jsonl');
    const approvals = this.loadJSONL('approvals/approvals.jsonl');
    const actions = this.loadJSONL('actions/actions.jsonl');
    const receipts = this.loadJSONL('receipts/receipts.jsonl');
    
    const brief = {
      date: today,
      generated_at: timestamp(),
      summary: {
        signals_processed: events.filter((e: Event) => e.type === 'signal.classified').length,
        actions_taken: actions.filter((a: Action) => a.status === 'succeeded').length,
        actions_blocked: actions.filter((a: Action) => a.status === 'blocked').length,
        approvals_requested: approvals.length,
        approvals_granted: approvals.filter((a: Approval) => a.status === 'approved').length,
        approvals_denied: approvals.filter((a: Approval) => a.status === 'denied').length
      },
      top_priorities: events
        .filter((e: Event) => e.priority && ['critical', 'high'].includes(e.priority))
        .slice(0, 5)
        .map((e: Event) => ({
          id: e.id,
          summary: e.payload?.signal?.classified?.summary || 'No summary',
          priority: e.priority
        })),
      receipts: receipts.map((r: Receipt) => r.id)
    };
    
    const briefPath = `daily_brief_${today}.md`;
    const markdown = this.toMarkdown(brief);
    
    writeJSON('', briefPath, { markdown, json: brief });
    
    return { brief, path: briefPath };
  }
  
  private loadJSONL(filename: string): unknown[] {
    const filePath = `/home/workspace/founder-command-center/${filename}`;
    if (!fs.existsSync(filePath)) return [];
    
    return fs.readFileSync(filePath, 'utf-8')
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  }
  
  private toMarkdown(brief: object): string {
    const b = brief as any;
    return `# Daily Brief — ${b.date}

Generated: ${b.generated_at}

## Summary

| Metric | Count |
|--------|-------|
| Signals Processed | ${b.summary.signals_processed} |
| Actions Taken | ${b.summary.actions_taken} |
| Actions Blocked | ${b.summary.actions_blocked} |
| Approvals Requested | ${b.summary.approvals_requested} |
| Approvals Granted | ${b.summary.approvals_granted} |
| Approvals Denied | ${b.summary.approvals_denied} |

## Top Priorities

${b.top_priorities.map((p: any) => `- **[${p.priority}]** ${p.summary}`).join('\n')}

## Receipts

${b.receipts.map((r: string) => `- ${r}`).join('\n')}
`;
  }
}

// Main Orchestrator

export class FounderTriageLoop {
  private ingestor = new SignalIngestor();
  private approvalGate = new ApprovalGate();
  private executor = new ActionExecutor();
  private ledger = new ReceiptLedger();
  private briefGen = new DailyBriefGenerator();
  
  async run(signalRaw: string, source: SignalSource): Promise<{
    signal: Signal;
    event: Event;
    action: Action;
    approval?: Approval;
    receipt: Receipt;
  }> {
    // Step 1: Ingest signal
    const signal = this.ingestor.ingest(signalRaw, source);
    
    // Step 2: Classify signal
    const event = this.ingestor.classify(signal);
    
    // Step 3: Propose action
    const action = this.executor.propose(signal, signal.classified!);
    
    // Step 4: Check if approval needed
    let approval: Approval | undefined;
    const needsApproval = this.approvalGate.needsApproval(signal.classified!.priority);
    
    if (needsApproval) {
      approval = this.approvalGate.requestApproval(action, signal.raw);
      
      // Simulate approval decision (in real system, this would be human input)
      const approved = signal.classified!.priority !== 'critical'; // Auto-deny critical for demo
      approval = this.approvalGate.decide(approval.id, approved, 'Demo auto-decision') || approval;
    }
    
    // Step 5: Execute action
    const isApproved = !needsApproval || approval?.status === 'approved';
    const executedAction = this.executor.execute(action, isApproved);
    
    // Step 6: Write receipt
    const receiptStatus = executedAction.status === 'succeeded' ? 'success' : 
                          executedAction.status === 'blocked' ? 'blocked' : 'failure';
    event.result = executedAction.result;
    event.approval_ref = approval?.id;
    const receipt = this.ledger.write(event, receiptStatus);
    
    // Step 7: Generate brief
    const { brief, path } = this.briefGen.generate();
    
    return {
      signal,
      event,
      action: executedAction,
      approval,
      receipt
    };
  }
}