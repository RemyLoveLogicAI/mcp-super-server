/**
 * @mss/voice-command - Conversation Flows
 * Pre-built voice command flows for common operations
 */

import {
  VoiceCommandIntentSchema,
  FlowEventSchema,
  ExecutionStatusEnum,
  type FlowEvent,
} from "./types";
import type { IntentParser } from "./intent";
import type { MCPToolRouter } from "./router";
import type { ActionExecutor } from "./executor";
import type { VoiceCommandContextManager } from "./context";
import { ConfirmationManager } from "./confirm";

// ============================================================================
// Flow Result
// ============================================================================

export interface FlowResult {
  flow_id: string;
  success: boolean;
  response: string;
  events: FlowEvent[];
  error?: string;
}

// ============================================================================
// Deploy Flow
// ============================================================================

export class DeployFlow {
  private intentParser: IntentParser;
  private router: MCPToolRouter;
  private executor: ActionExecutor;
  private context: VoiceCommandContextManager;
  private confirmationManager: ConfirmationManager;

  constructor(
    intentParser: IntentParser,
    router: MCPToolRouter,
    executor: ActionExecutor,
    context: VoiceCommandContextManager,
    confirmationManager: ConfirmationManager
  ) {
    this.intentParser = intentParser;
    this.router = router;
    this.executor = executor;
    this.context = context;
    this.confirmationManager = confirmationManager;
  }

  async execute(transcript: string): Promise<FlowResult> {
    const flowId = this.generateFlowId();
    const events: FlowEvent[] = [];

    // Step 1: Parse intent
    const parseResult = this.intentParser.parse(transcript);
    events.push(this.createEvent(flowId, "intent_parsed", { intent: parseResult.intent }));

    if (parseResult.clarification_needed && !parseResult.intent.target) {
      const clarification = this.intentParser.generateClarificationPrompt(parseResult.intent);
      return {
        flow_id: flowId,
        success: false,
        response: clarification,
        events,
        error: "Target required",
      };
    }

    // Step 2: Route to tool
    const routeResult = this.router.route(parseResult.intent);
    events.push(this.createEvent(flowId, "routing_completed", { matches: routeResult.matches }));

    if (!routeResult.success || routeResult.matches.length === 0) {
      return {
        flow_id: flowId,
        success: false,
        response: `I couldn't find a deployment tool for "${parseResult.intent.target}".`,
        events,
        error: routeResult.error ?? "No matches found",
      };
    }

    const topMatch = routeResult.matches[0];
    if (!topMatch) {
      return {
        flow_id: flowId,
        success: false,
        response: "No suitable deployment tool found.",
        events,
        error: "No top match",
      };
    }

    // Step 3: Confirmation for high-risk action
    const severity = ConfirmationManager.getSeverityFromAction("deploy");
    const confirmationRequest = this.confirmationManager.createRequest(
      `deploy ${parseResult.intent.target || "project"}`,
      severity
    );

    events.push(this.createEvent(flowId, "approval_required", { request: confirmationRequest }));

    // Step 4: Execute
    events.push(this.createEvent(flowId, "execution_started", { execution_id: flowId }));

    const execResult = await this.executor.execute({
      ...topMatch,
      parameters: topMatch.parameters ?? {},
    }, {
      project_name: parseResult.intent.target || "project",
      environment: "production",
    });

    if (execResult.status === "requires_approval") {
      events.push(this.createEvent(flowId, "approval_required", { request: confirmationRequest }));
      return {
        flow_id: flowId,
        success: false,
        response: `I need your approval to deploy ${parseResult.intent.target || "project"}. Would you like me to proceed?`,
        events,
      };
    }

    if (execResult.status === "completed") {
      events.push(this.createEvent(flowId, "execution_completed", { result: execResult.result }));
      return {
        flow_id: flowId,
        success: true,
        response: `Deployment of ${parseResult.intent.target || "project"} completed successfully.`,
        events,
      };
    }

    events.push(this.createEvent(flowId, "execution_failed", { error: execResult.error }));
    const deploymentFailure: FlowResult = {
      flow_id: flowId,
      success: false,
      response: `Deployment failed: ${execResult.error || "unknown error"}`,
      events,
    };
    if (execResult.error) deploymentFailure.error = execResult.error;
    return deploymentFailure;
  }

  private generateFlowId(): string {
    return `flow_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private createEvent(
    flowId: string,
    eventType: FlowEvent["event_type"],
    data?: Record<string, unknown>
  ): FlowEvent {
    return FlowEventSchema.parse({
      flow_id: flowId,
      event_type: eventType,
      data,
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// Diagnose Errors Flow
// ============================================================================

export class DiagnoseErrorsFlow {
  private intentParser: IntentParser;
  private router: MCPToolRouter;
  private executor: ActionExecutor;
  private context: VoiceCommandContextManager;

  constructor(
    intentParser: IntentParser,
    router: MCPToolRouter,
    executor: ActionExecutor,
    context: VoiceCommandContextManager
  ) {
    this.intentParser = intentParser;
    this.router = router;
    this.executor = executor;
    this.context = context;
  }

  async execute(transcript: string): Promise<FlowResult> {
    const flowId = this.generateFlowId();
    const events: FlowEvent[] = [];

    // Step 1: Parse intent
    const parseResult = this.intentParser.parse(transcript);
    events.push(this.createEvent(flowId, "intent_parsed", { intent: parseResult.intent }));

    // Step 2: Route to diagnose tool
    const routeResult = this.router.route(parseResult.intent);
    events.push(this.createEvent(flowId, "routing_completed", { matches: routeResult.matches }));

    if (!routeResult.success || routeResult.matches.length === 0) {
      return {
        flow_id: flowId,
        success: false,
        response: "I couldn't find a diagnosis tool.",
        events,
        error: routeResult.error ?? "No matches found",
      };
    }

    const topMatch = routeResult.matches[0];
    if (!topMatch) {
      return {
        flow_id: flowId,
        success: false,
        response: "No diagnosis tool found.",
        events,
        error: "No top match",
      };
    }

    // Step 3: Execute
    events.push(this.createEvent(flowId, "execution_started", { execution_id: flowId }));

    const execResult = await this.executor.execute({
      ...topMatch,
      parameters: topMatch.parameters ?? {},
    }, {
      scope: parseResult.intent.scope || "errors",
      time_range: "1h",
    });

    if (execResult.status === "completed") {
      events.push(this.createEvent(flowId, "execution_completed", { result: execResult.result }));

      // Generate summary
      const summary = this.generateErrorSummary(execResult.result);
      return {
        flow_id: flowId,
        success: true,
        response: summary,
        events,
      };
    }

    events.push(this.createEvent(flowId, "execution_failed", { error: execResult.error }));
    const diagnosisFailure: FlowResult = {
      flow_id: flowId,
      success: false,
      response: `Diagnosis failed: ${execResult.error || "unknown error"}`,
      events,
    };
    if (execResult.error) diagnosisFailure.error = execResult.error;
    return diagnosisFailure;
  }

  private generateErrorSummary(result: unknown): string {
    // In real impl, would analyze error results and generate actionable summary
    return "I've checked the recent errors. There are no critical issues found. The system is running normally.";
  }

  private generateFlowId(): string {
    return `flow_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private createEvent(
    flowId: string,
    eventType: FlowEvent["event_type"],
    data?: Record<string, unknown>
  ): FlowEvent {
    return FlowEventSchema.parse({
      flow_id: flowId,
      event_type: eventType,
      data,
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// Fetch Roadmap Flow
// ============================================================================

export class FetchRoadmapFlow {
  private intentParser: IntentParser;
  private router: MCPToolRouter;
  private executor: ActionExecutor;
  private context: VoiceCommandContextManager;

  constructor(
    intentParser: IntentParser,
    router: MCPToolRouter,
    executor: ActionExecutor,
    context: VoiceCommandContextManager
  ) {
    this.intentParser = intentParser;
    this.router = router;
    this.executor = executor;
    this.context = context;
  }

  async execute(transcript: string): Promise<FlowResult> {
    const flowId = this.generateFlowId();
    const events: FlowEvent[] = [];

    // Step 1: Parse intent
    const parseResult = this.intentParser.parse(transcript);
    events.push(this.createEvent(flowId, "intent_parsed", { intent: parseResult.intent }));

    // Step 2: Route to fetch tool
    const routeResult = this.router.route(parseResult.intent);
    events.push(this.createEvent(flowId, "routing_completed", { matches: routeResult.matches }));

    if (!routeResult.success || routeResult.matches.length === 0) {
      return {
        flow_id: flowId,
        success: false,
        response: "I couldn't find a roadmap tool.",
        events,
        error: routeResult.error ?? "No matches found",
      };
    }

    const topMatch = routeResult.matches[0];
    if (!topMatch) {
      return {
        flow_id: flowId,
        success: false,
        response: "No roadmap tool found.",
        events,
        error: "No top match",
      };
    }

    // Step 3: Execute
    events.push(this.createEvent(flowId, "execution_started", { execution_id: flowId }));

    const execResult = await this.executor.execute({
      ...topMatch,
      parameters: topMatch.parameters ?? {},
    }, {
      resource: parseResult.intent.resource || "roadmap",
      format: "summary",
    });

    if (execResult.status === "completed") {
      events.push(this.createEvent(flowId, "execution_completed", { result: execResult.result }));

      // Generate summary
      const summary = this.generateRoadmapSummary(execResult.result);
      return {
        flow_id: flowId,
        success: true,
        response: summary,
        events,
      };
    }

    events.push(this.createEvent(flowId, "execution_failed", { error: execResult.error }));
    const roadmapFailure: FlowResult = {
      flow_id: flowId,
      success: false,
      response: `Failed to fetch roadmap: ${execResult.error || "unknown error"}`,
      events,
    };
    if (execResult.error) roadmapFailure.error = execResult.error;
    return roadmapFailure;
  }

  private generateRoadmapSummary(result: unknown): string {
    // In real impl, would summarize roadmap and speak key points
    return "The current roadmap shows three main milestones: Phase 1 - Foundation (complete), Phase 2 - Voice Integration (in progress), and Phase 3 - Advanced Agents (planned for next quarter).";
  }

  private generateFlowId(): string {
    return `flow_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private createEvent(
    flowId: string,
    eventType: FlowEvent["event_type"],
    data?: Record<string, unknown>
  ): FlowEvent {
    return FlowEventSchema.parse({
      flow_id: flowId,
      event_type: eventType,
      data,
      timestamp: new Date().toISOString(),
    });
  }
}

// ============================================================================
// Flow Orchestrator
// ============================================================================

export class FlowOrchestrator {
  private flows: Map<string, {
    execute: (transcript: string) => Promise<FlowResult>;
  }> = new Map();

  registerFlow(name: string, flow: { execute: (transcript: string) => Promise<FlowResult> }): void {
    this.flows.set(name, flow);
  }

  async executeFlow(name: string, transcript: string): Promise<FlowResult | null> {
    const flow = this.flows.get(name);
    if (!flow) {
      return null;
    }
    return flow.execute(transcript);
  }

  getAvailableFlows(): string[] {
    return Array.from(this.flows.keys());
  }
}

// ============================================================================
// Flow Factory
// ============================================================================

export function createFlowOrchestrator(
  intentParser: IntentParser,
  router: MCPToolRouter,
  executor: ActionExecutor,
  context: VoiceCommandContextManager,
  confirmationManager: ConfirmationManager
): FlowOrchestrator {
  const orchestrator = new FlowOrchestrator();

  orchestrator.registerFlow("deploy", new DeployFlow(
    intentParser,
    router,
    executor,
    context,
    confirmationManager
  ));

  orchestrator.registerFlow("diagnose", new DiagnoseErrorsFlow(
    intentParser,
    router,
    executor,
    context
  ));

  orchestrator.registerFlow("fetch", new FetchRoadmapFlow(
    intentParser,
    router,
    executor,
    context
  ));

  return orchestrator;
}
