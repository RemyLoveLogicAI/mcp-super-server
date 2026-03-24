/**
 * @mss/orchestrator - Agent Handoff Protocol
 * Whitepaper §4.2.4: Multi-Agent Delegation
 */

export type HandoffReason = 
  | "capability_mismatch"
  | "load_balancing"
  | "user_request"
  | "specialist_required";

export interface HandoffRequest {
  fromAgentId: string;
  toAgentId: string;
  sessionId: string;
  reason: HandoffReason;
  context: Record<string, unknown>;
  priority: "low" | "normal" | "high";
}

export interface HandoffResponse {
  accepted: boolean;
  toAgentId: string;
  redirectContext?: Record<string, unknown>;
  rejectionReason?: string;
}

export interface AgentHandoffProtocol {
  requestHandoff(request: HandoffRequest): Promise<HandoffResponse>;
  acceptHandoff(agentId: string, sessionId: string): Promise<void>;
  rejectHandoff(agentId: string, sessionId: string, reason: string): Promise<void>;
}

export class InMemoryHandoffProtocol implements AgentHandoffProtocol {
  private pendingHandoffs: Map<string, HandoffRequest> = new Map();
  private agentSessions: Map<string, string> = new Map(); // agent -> session
  
  async requestHandoff(request: HandoffRequest): Promise<HandoffResponse> {
    this.pendingHandoffs.set(request.sessionId, request);
    this.agentSessions.delete(request.fromAgentId);
    
    // In real impl, would notify target agent
    return {
      accepted: true,
      toAgentId: request.toAgentId,
      redirectContext: request.context
    };
  }
  
  async acceptHandoff(agentId: string, sessionId: string): Promise<void> {
    this.agentSessions.set(agentId, sessionId);
    this.pendingHandoffs.delete(sessionId);
  }
  
  async rejectHandoff(agentId: string, sessionId: string, reason: string): Promise<void> {
    const request = this.pendingHandoffs.get(sessionId);
    if (request) {
      console.log(`[Handoff] ${agentId} rejected from ${request.fromAgentId}: ${reason}`);
    }
    this.pendingHandoffs.delete(sessionId);
  }
}
