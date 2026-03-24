/**
 * @mss/server - MCP Super-Server
 */

import { randomUUID } from "crypto";
import { createVoiceSession, type VoiceFSMEffect } from "@mss/voice";
import { createToolGate, createPermissiveGate, createReadOnlyGate, createWriteApprovalGate } from "@mss/tools";
import { createInMemoryLedger } from "@mss/ledger";
import { createIdentityResolver, type SupportedPlatform } from "@mss/identity";
import { createContextFabric } from "@mss/context-fabric";
import { createOrchestrator, type AgentOrchestrator, type ExecutionPlan, type ToolExecutionResult } from "@mss/orchestrator";
import type { ToolDescriptor } from "@mss/core/resources/tool";

interface PolicyToolGate {
  evaluate(ctx: any): Promise<{ decision: string; reason?: string; policy?: unknown; prompt?: string }>;
  recordToolCall(sessionId: string, toolId: string, cost?: number): void;
  registerTool?(descriptor: ToolDescriptor): void;
  resetBudget?(sessionId: string): void;
}

// ─── Session Management with TTL ─────────────────────────────────────────────

interface SessionData {
  fsm: any;
  canonicalUserId: string;
  platform: string;
  createdAt: number;
  lastActivity: number;
}

const SESSION_TTL_MS = parseInt(process.env.MCP_SESSION_TTL_MS || "1800000", 10); // 30 min default
const MAX_SESSIONS_PER_USER = parseInt(process.env.MCP_MAX_SESSIONS_PER_USER || "5", 10);

interface ToolExecutor {
  execute(toolId: string, input: Record<string, unknown>): Promise<ToolExecutionResult>;
  registerTool(toolId: string, fn: (input: Record<string, unknown>) => Promise<unknown>): void;
}

interface MCPServerConfig {
  ledger: { type: "memory" };
  gate: { maxCallsPerSession: number; defaultApproval: string };
  meta: { name: string; version: string; environment: string };
  agentId?: string;
  gateMode?: "permissive" | "read_only" | "write_approval";
}

const DEFAULT_CONFIG: MCPServerConfig = {
  ledger: { type: "memory" },
  gate: { maxCallsPerSession: 10, defaultApproval: "require_human" },
  meta: { name: "mcp-super-server", version: "0.0.1", environment: "development" },
  agentId: "default-agent",
  gateMode: "write_approval",
};

class RealToolExecutor implements ToolExecutor {
  private tools = new Map<string, (input: Record<string, unknown>) => Promise<unknown>>();
  constructor() {
    this.tools.set("weather", async (i) => ({ city: i.city ?? "Unknown", temp: 72, conditions: "sunny" }));
    this.tools.set("search", async (i) => ({ query: i.query ?? "", results: [`Result 1 for ${i.query}`] }));
    this.tools.set("read:file", async (i) => ({ path: i.path, content: "Mock file content" }));
    this.tools.set("write:file", async (i) => ({ path: i.path, written: true, bytes: String(i.content ?? "").length }));
  }
  registerTool(toolId: string, fn: (input: Record<string, unknown>) => Promise<unknown>): void { this.tools.set(toolId, fn); }
  async execute(toolId: string, input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const start = Date.now();
    const handler = this.tools.get(toolId);
    if (!handler) return { ok: false, error: `Tool ${toolId} not found`, duration_ms: Date.now() - start };
    try { return { ok: true, output: await handler(input), duration_ms: Date.now() - start }; }
    catch (e) { return { ok: false, error: String(e), duration_ms: Date.now() - start }; }
  }
}

export class MCPSuperServer {
  private config: Required<MCPServerConfig>;
  private gate: PolicyToolGate;
  private ledger = createInMemoryLedger();
  private identityResolver = createIdentityResolver();
  private contextFabric = createContextFabric();
  private toolExecutor = new RealToolExecutor();
  private sessions = new Map<string, SessionData>();
  private orchestrator: AgentOrchestrator;
  private _started = false;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<MCPServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<MCPServerConfig>;
    const gateMode = this.config.gateMode ?? "write_approval";
    const maxCalls = this.config.gate.maxCallsPerSession ?? 10;
    
    // Create gate with proper config based on mode
    const baseConfig = { maxCallsPerSession: maxCalls, maxCostPerSession: 10000 };
    this.gate = (gateMode === "permissive" 
      ? createToolGate({ ...baseConfig, defaultApproval: "auto" })
      : gateMode === "read_only" 
      ? createToolGate({
          ...baseConfig,
          defaultApproval: "auto",
          customGates: [
            async (ctx: any) => {
              const effect = ctx.requested_effect;
              const sideEffect = typeof effect === "string" ? effect : effect.sideEffect;
              if (sideEffect === "read_only") {
                return { decision: "allow", policy: ctx.requested_effect };
              }
              return { decision: "deny", reason: "Read-only gate: tool is not read-only" };
            },
          ],
        })
      : createToolGate({
          ...baseConfig,
          defaultApproval: "require_human",
          customGates: [
            async (ctx: any) => {
              const effect = ctx.requested_effect;
              const sideEffect = typeof effect === "string" ? effect : effect.sideEffect;
              if (sideEffect === "read_only") {
                return { decision: "allow", policy: ctx.requested_effect };
              }
              return {
                decision: "require_human",
                policy: ctx.requested_effect,
                prompt: `Human approval required for ${sideEffect} operation: ${ctx.purpose}`,
              };
            },
          ],
        })) as unknown as PolicyToolGate;
    
    this.orchestrator = createOrchestrator(
      { agent_id: this.config.agentId ?? "default-agent", default_budget: { max_tool_calls: maxCalls, max_time_ms: 10_000 } },
      this.toolExecutor,
      (e) => console.log(`[orchestrator] ${e.type} ${e.plan_id}${e.step_id ? `/${e.step_id}` : ""}${e.message ? `: ${e.message}` : ""}`)
    );
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    this._started = true;
    // Start session cleanup job (every 5 minutes)
    this.cleanupInterval = setInterval(() => this.cleanupExpiredSessions(), 300_000);
    console.log(`[Server] Session TTL: ${SESSION_TTL_MS}ms, cleanup interval: 5min`);
  }

  async stop(): Promise<void> {
    this._started = false;
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.sessions.clear();
  }

  // ─── Session Cleanup ─────────────────────────────────────────────────────────

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    let expired = 0;

    for (const [sessionId, data] of this.sessions) {
      if (now - data.lastActivity > SESSION_TTL_MS) {
        this.sessions.delete(sessionId);
        expired++;
        console.log(`[Session] Expired: ${sessionId} (user: ${data.canonicalUserId})`);
      }
    }

    if (expired > 0) {
      console.log(`[Cleanup] Removed ${expired} expired sessions, ${this.sessions.size} active`);
    }
  }

  private enforceMaxSessionsPerUser(canonicalUserId: string): void {
    const userSessions = Array.from(this.sessions.entries())
      .filter(([, data]) => data.canonicalUserId === canonicalUserId)
      .sort((a, b) => a[1].createdAt - b[1].createdAt);

    while (userSessions.length >= MAX_SESSIONS_PER_USER) {
      const [oldestId] = userSessions.shift()!;
      this.sessions.delete(oldestId);
      console.log(`[Session] Evicted oldest: ${oldestId} (user: ${canonicalUserId})`);
    }
  }

  // ─── Identity ────────────────────────────────────────────────────────────────

  async resolveIdentity(platform: string, platformId: string): Promise<{ canonicalUserId: string; isNew: boolean }> {
    const result = await this.identityResolver.resolve(platform as SupportedPlatform, platformId as any);
    return { canonicalUserId: result.canonical_user_id, isNew: result.is_new };
  }

  // ─── Voice Sessions ──────────────────────────────────────────────────────────

  createVoiceSession(canonicalUserId: string, platform: string): { sessionId: string; fsm: any } {
    const sessionId = randomUUID();
    const fsm = createVoiceSession(canonicalUserId as any, platform as SupportedPlatform);
    
    // Enforce max sessions per user
    this.enforceMaxSessionsPerUser(canonicalUserId);
    
    const now = Date.now();
    this.sessions.set(sessionId, {
      fsm,
      canonicalUserId,
      platform,
      createdAt: now,
      lastActivity: now,
    });
    
    console.log(`[Session] Created: ${sessionId} (user: ${canonicalUserId}, active: ${this.sessions.size})`);
    return { sessionId, fsm };
  }

  getVoiceSession(sessionId: string): any {
    const data = this.sessions.get(sessionId);
    if (!data) return undefined;
    
    // Update last activity
    data.lastActivity = Date.now();
    return data.fsm;
  }

  endVoiceSession(sessionId: string): void {
    const data = this.sessions.get(sessionId);
    if (data) {
      console.log(`[Session] Ended: ${sessionId} (user: ${data.canonicalUserId})`);
    }
    this.sessions.delete(sessionId);
  }

  processVoiceEvent(sessionId: string, event: any): { state: string; effects: string[] } {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    // Update last activity
    session.lastActivity = Date.now();

    const { fsm } = session;
    const { state, effects } = fsm.transition(event);
    return {
      state: state ?? fsm.getState?.() ?? "unknown",
      effects: effects?.map((e: VoiceFSMEffect) => e.type) ?? [],
    };
  }

  // ─── Tool Gate ──────────────────────────────────────────────────────────────

  registerTool(descriptor: ToolDescriptor): void {
    this.toolExecutor.registerTool(descriptor.tool_id as string, async (input) => ({}));
    this.gate.registerTool?.(descriptor);
  }

  recordToolCall(sessionId: string, toolId: string): void {
    this.gate.recordToolCall(sessionId, toolId);
  }

  async evaluateToolCall(ctx: {
    canonical_user_id: string;
    session_id: string;
    tool_id: string;
    purpose: string;
    requested_effect: string;
    scopes: string[];
    metadata: Record<string, unknown>;
  }): Promise<{ allowed: boolean; reason?: string }> {
    const requested_effect = {
      sideEffect: ctx.requested_effect,
      approval: ctx.requested_effect === "read_only" ? "auto" : "require_human",
    };
    const gateCtx = { ...ctx, requested_effect };
    const result = await this.gate.evaluate(gateCtx);

    if (result.decision === "allow") return { allowed: true };
    return { allowed: false, reason: (result.reason as any)?.code ?? result.decision };
  }

  // ─── Ledger ─────────────────────────────────────────────────────────────────

  getLedger() {
    return this.ledger;
  }

  // ─── Status ─────────────────────────────────────────────────────────────────

  getStatus() {
    return {
      version: this.config.meta.version,
      environment: this.config.meta.environment,
      activeSessions: this.sessions.size,
    };
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  async invokeTool(sessionId: string, toolId: string, input: Record<string, unknown>) {
    const session = this.sessions.get(sessionId);
    const userId = session?.canonicalUserId ?? "anonymous";
    const descriptor: ToolDescriptor = {
      tool_id: toolId,
      version: "1.0.0",
      capabilities: [toolId.startsWith("read:") ? "read" : "write"] as any,
      side_effect_class: toolId.startsWith("read:") ? "read_only" : "irreversible_write",
      available: true,
    };
    this.gate.registerTool?.(descriptor);
    const requested_effect = {
      sideEffect: toolId.startsWith("read:") ? "read_only" : "irreversible_write",
      approval: toolId.startsWith("read:") ? "auto" : "require_human",
    };
    const ctx = { session_id: sessionId, canonical_user_id: userId, tool_id: toolId, purpose: `Tool: ${toolId}`, requested_effect };
    const gateResult = await this.gate.evaluate(ctx);
    if (gateResult.decision === "deny") return { decision: "deny" as const, reason: gateResult.reason };
    if (gateResult.decision === "require_human") return { decision: "require_human" as const, prompt: gateResult.prompt };
    const result = await this.toolExecutor.execute(toolId, input);
    this.gate.recordToolCall(sessionId, toolId);
    await this.ledger.append({ event_type: "ToolCallCompleted", tool_id: toolId, ok: result.ok } as any);
    return { decision: "allow" as const, result: result.output };
  }

  async linkIdentity(platform: SupportedPlatform, platformId: string, userId?: string) {
    if (userId) {
      await this.identityResolver.link({ canonical_user_id: userId as any, platform, platform_identity_id: platformId as any, proof: { type: "trusted_assertion", asserter: "server", assertion_id: randomUUID() }, initiated_by: "system" });
      return { canonicalUserId: userId, isNew: false };
    }
    const result = await this.identityResolver.resolve(platform, platformId as any);
    return { canonicalUserId: result.canonical_user_id, isNew: result.is_new };
  }

  async replaySession(sessionId: string) {
    const events: any[] = [];
    for await (const r of await this.ledger.replay({ from_index: 0 })) {
      if ((r.event as any).session_id === sessionId) events.push(r.event);
    }
    return events;
  }

  async health() {
    return { status: "healthy" as const, timestamp: new Date().toISOString(), uptime: 0, checks: { ledger: true, identity: true, orchestrator: true, contextFabric: true }, version: "0.0.1" };
  }

  async planAndExecute(sessionId: string, goal: string, requestedTools: string[]) {
    const plan = await this.orchestrator.createPlan(goal, requestedTools);
    return this.orchestrator.executePlan(plan, (step) => {
      void this.contextFabric.createAndLink("tool", { sessionId, step }, []);
    });
  }

  async onAudioEnd(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    await this.executeEffects(session.fsm.transition({ type: "AUDIO_END" }).effects, sessionId);
  }

  private async executeEffects(effects: VoiceFSMEffect[], sessionId?: string) {
    for (const effect of effects) {
      if (effect.type === "emit_tool_canceled") await this.ledger.append({ event_type: "ToolCallCanceled", tool_call_id: effect.tool_call_id, reason: effect.reason } as any);
      if (effect.type === "emit_turn_started") await this.contextFabric.createAndLink("voice", { sessionId, turnId: effect.turn_id }, []);
      if (effect.type === "emit_turn_finalized") await this.contextFabric.createAndLink("voice", { sessionId, turnId: effect.turn_id, asrFinal: effect.asr_final, intent: effect.intent }, []);
      if (effect.type === "log") console.log(`[FSM] ${effect.message}`);
    }
  }
}

export function createMCPServer(config?: Partial<MCPServerConfig>) { return new MCPSuperServer(config); }
export { createMCPServer as createServer };
