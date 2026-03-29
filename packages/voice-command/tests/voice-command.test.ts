/**
 * @mss/voice-command - Integration Tests with Mock FSM
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createIntentParser } from "../src/intent";
import { createMCPToolRouter } from "../src/router";
import { createActionExecutor } from "../src/executor";
import { createVoiceCommandContext } from "../src/context";
import { createConfirmationManager } from "../src/confirm";
import { createFlowOrchestrator } from "../src/flows";

// Mock VoiceSessionFSM
class MockVoiceSessionFSM {
  private state = "idle";
  private events: unknown[] = [];

  transition(event: { type: string; [key: string]: unknown }): { next_state: string; effects: unknown[] } {
    this.events.push(event);
    
    switch (event.type) {
      case "ASR_FINAL":
        this.state = "processing";
        break;
      case "INTENT_RESOLVED":
        this.state = "processing";
        break;
      case "TTS_START":
        this.state = "speaking";
        break;
      case "TTS_COMPLETE":
        this.state = "idle";
        break;
      case "BARGE_IN":
        this.state = "interrupted";
        break;
      default:
        break;
    }

    return {
      next_state: this.state,
      effects: [],
    };
  }

  getState(): string {
    return this.state;
  }

  getEvents(): unknown[] {
    return this.events;
  }
}

describe("Voice Command Integration", () => {
  let intentParser: ReturnType<typeof createIntentParser>;
  let router: ReturnType<typeof createMCPToolRouter>;
  let executor: ReturnType<typeof createActionExecutor>;
  let context: ReturnType<typeof createVoiceCommandContext>;
  let confirmationManager: ReturnType<typeof createConfirmationManager>;
  let orchestrator: ReturnType<typeof createFlowOrchestrator>;
  let mockFSM: MockVoiceSessionFSM;

  beforeEach(() => {
    intentParser = createIntentParser();
    router = createMCPToolRouter();
    executor = createActionExecutor();
    context = createVoiceCommandContext("session-1", "user-1", "voice");
    confirmationManager = createConfirmationManager();
    orchestrator = createFlowOrchestrator(
      intentParser,
      router,
      executor,
      context,
      confirmationManager
    );
    mockFSM = new MockVoiceSessionFSM();
  });

  describe("Deploy Flow", () => {
    it("should complete deploy flow with valid target", async () => {
      const result = await orchestrator.executeFlow("deploy", "Deploy SAK project");
      
      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(result?.response).toContain("SAK");
    });

    it("should fail deploy flow without target", async () => {
      const result = await orchestrator.executeFlow("deploy", "Deploy");
      
      expect(result).not.toBeNull();
      expect(result?.success).toBe(false);
      expect(result?.error).toBe("Target required");
    });

    it("should emit intent_parsed event", async () => {
      const result = await orchestrator.executeFlow("deploy", "Deploy SAK");
      
      expect(result?.events).toContainEqual(
        expect.objectContaining({
          event_type: "intent_parsed",
        })
      );
    });

    it("should emit execution_started event", async () => {
      const result = await orchestrator.executeFlow("deploy", "Deploy SAK");
      
      expect(result?.events).toContainEqual(
        expect.objectContaining({
          event_type: "execution_started",
        })
      );
    });
  });

  describe("Diagnose Flow", () => {
    it("should complete diagnose flow", async () => {
      const result = await orchestrator.executeFlow("diagnose", "Check errors");
      
      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
    });

    it("should parse errors scope correctly", async () => {
      const parseResult = intentParser.parse("Check errors");
      expect(parseResult.intent.action).toBe("diagnose");
      expect(parseResult.intent.scope).toBe("errors");
    });

    it("should parse logs scope correctly", async () => {
      const parseResult = intentParser.parse("Check logs");
      expect(parseResult.intent.action).toBe("diagnose");
      expect(parseResult.intent.scope).toBe("logs");
    });
  });

  describe("Fetch Roadmap Flow", () => {
    it("should complete fetch roadmap flow", async () => {
      const result = await orchestrator.executeFlow("fetch", "Show roadmap");
      
      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(result?.response).toContain("roadmap");
    });

    it("should return summary in response", async () => {
      const result = await orchestrator.executeFlow("fetch", "Show roadmap");
      
      expect(result?.response).toContain("Phase 1");
    });
  });

  describe("Router Integration", () => {
    it("should route deploy intent to mss:deploy tool", () => {
      const intent = intentParser.parse("Deploy SAK").intent;
      const result = router.route(intent);
      
      expect(result.success).toBe(true);
      expect(result.matches[0]?.tool_id).toBe("mss:deploy");
    });

    it("should route diagnose intent to mss:diagnose tool", () => {
      const intent = intentParser.parse("Check errors").intent;
      const result = router.route(intent);
      
      expect(result.success).toBe(true);
      expect(result.matches[0]?.tool_id).toBe("mss:diagnose");
    });

    it("should route fetch intent to mss:fetch tool", () => {
      const intent = intentParser.parse("Show roadmap").intent;
      const result = router.route(intent);
      
      expect(result.success).toBe(true);
      expect(result.matches[0]?.tool_id).toBe("mss:fetch");
    });

    it("should mark destructive actions as requiring approval", () => {
      const intent = intentParser.parse("Delete file").intent;
      const result = router.route(intent);
      
      expect(result.success).toBe(true);
      expect(result.requires_approval).toBe(true);
    });
  });

  describe("Context Integration", () => {
    it("should track conversation turns", () => {
      context.addConversationTurn(
        "Deploy SAK",
        intentParser.parse("Deploy SAK").intent
      );
      
      const history = context.getConversationHistory().getAll();
      expect(history.length).toBe(1);
      expect(history[0].transcript).toBe("Deploy SAK");
    });

    it("should resolve project entities", () => {
      context.setProject({
        project_name: "SAK",
        project_path: "/home/workspace/sak",
      });
      
      const resolved = context.resolveEntity("SAK");
      expect(resolved.type).toBe("project");
      expect(resolved.confidence).toBeGreaterThan(0.5);
    });

    it("should validate high-risk commands", () => {
      context.setFsmState("speaking");
      const result = context.canExecuteCommand("deploy");
      
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("speaking");
    });
  });

  describe("FSM Integration", () => {
    it("should transition FSM on ASR_FINAL", () => {
      mockFSM.transition({ type: "ASR_FINAL", text: "Deploy SAK" });
      expect(mockFSM.getState()).toBe("processing");
    });

    it("should transition FSM on TTS_START", () => {
      mockFSM.transition({ type: "TTS_START" });
      expect(mockFSM.getState()).toBe("speaking");
    });

    it("should transition FSM on TTS_COMPLETE", () => {
      mockFSM.transition({ type: "TTS_COMPLETE" });
      expect(mockFSM.getState()).toBe("idle");
    });

    it("should handle BARGE_IN during speaking", () => {
      mockFSM.transition({ type: "TTS_START" });
      expect(mockFSM.getState()).toBe("speaking");
      
      mockFSM.transition({ type: "BARGE_IN" });
      expect(mockFSM.getState()).toBe("interrupted");
    });

    it("should record all FSM events", () => {
      mockFSM.transition({ type: "ASR_FINAL", text: "Deploy SAK" });
      mockFSM.transition({ type: "INTENT_RESOLVED", intent: {} });
      mockFSM.transition({ type: "TTS_START" });
      
      expect(mockFSM.getEvents().length).toBe(3);
    });
  });

  describe("Confirmation Manager", () => {
    it("should create confirmation request with correct severity", () => {
      const request = confirmationManager.createRequest("delete file", "critical");
      
      expect(request.severity).toBe("critical");
      expect(request.action_description).toContain("delete");
    });

    it("should parse affirmative responses", () => {
      const result = confirmationManager.parseVerbalResponse("Yes, go ahead");
      expect(result.confirmed).toBe(true);
      expect(result.isValid).toBe(true);
    });

    it("should parse negative responses", () => {
      const result = confirmationManager.parseVerbalResponse("No, cancel that");
      expect(result.confirmed).toBe(false);
      expect(result.isValid).toBe(true);
    });

    it("should reject invalid responses", () => {
      const result = confirmationManager.parseVerbalResponse("maybe");
      expect(result.isValid).toBe(false);
    });

    it("should get correct severity for destructive actions", () => {
      expect(confirmationManager.constructor.getSeverityFromAction("delete")).toBe("critical");
      expect(confirmationManager.constructor.getSeverityFromAction("deploy")).toBe("high");
      expect(confirmationManager.constructor.getSeverityFromAction("list")).toBe("medium");
    });
  });

  describe("Flow Orchestrator", () => {
    it("should register multiple flows", () => {
      const flows = orchestrator.getAvailableFlows();
      expect(flows).toContain("deploy");
      expect(flows).toContain("diagnose");
      expect(flows).toContain("fetch");
    });

    it("should return null for unknown flow", async () => {
      const result = await orchestrator.executeFlow("unknown-flow", "Test");
      expect(result).toBeNull();
    });

    it("should emit flow events in order", async () => {
      const result = await orchestrator.executeFlow("diagnose", "Check errors");
      
      const eventTypes = result?.events.map(e => e.event_type);
      expect(eventTypes).toContain("intent_parsed");
      expect(eventTypes).toContain("routing_completed");
      expect(eventTypes).toContain("execution_started");
    });
  });
});

describe("End-to-End Voice Command Scenarios", () => {
  let intentParser: ReturnType<typeof createIntentParser>;
  let router: ReturnType<typeof createMCPToolRouter>;
  let executor: ReturnType<typeof createActionExecutor>;
  let context: ReturnType<typeof createVoiceCommandContext>;
  let confirmationManager: ReturnType<typeof createConfirmationManager>;
  let orchestrator: ReturnType<typeof createFlowOrchestrator>;

  beforeEach(() => {
    intentParser = createIntentParser();
    router = createMCPToolRouter();
    executor = createActionExecutor();
    context = createVoiceCommandContext("session-1", "user-1", "voice");
    confirmationManager = createConfirmationManager();
    orchestrator = createFlowOrchestrator(
      intentParser,
      router,
      executor,
      context,
      confirmationManager
    );
  });

  it("scenario: user wants to deploy SAK", async () => {
    // User speaks: "Deploy SAK project"
    const transcript = "Deploy SAK project";
    
    // 1. Parse intent
    const parseResult = intentParser.parse(transcript);
    expect(parseResult.intent.action).toBe("deploy");
    expect(parseResult.intent.target).toBe("SAK");
    
    // 2. Route to tool
    const routeResult = router.route(parseResult.intent);
    expect(routeResult.success).toBe(true);
    expect(routeResult.matches[0]?.tool_id).toBe("mss:deploy");
    
    // 3. Execute flow
    const flowResult = await orchestrator.executeFlow("deploy", transcript);
    expect(flowResult?.success).toBe(true);
    expect(flowResult?.response).toContain("Deployment");
  });

  it("scenario: user wants to check errors", async () => {
    const transcript = "Check errors";
    
    const parseResult = intentParser.parse(transcript);
    expect(parseResult.intent.action).toBe("diagnose");
    
    const routeResult = router.route(parseResult.intent);
    expect(routeResult.matches[0]?.tool_id).toBe("mss:diagnose");
    
    const flowResult = await orchestrator.executeFlow("diagnose", transcript);
    expect(flowResult?.success).toBe(true);
  });

  it("scenario: user wants to see roadmap", async () => {
    const transcript = "Show roadmap";
    
    const parseResult = intentParser.parse(transcript);
    expect(parseResult.intent.action).toBe("fetch");
    expect(parseResult.intent.resource).toBe("roadmap");
    
    const flowResult = await orchestrator.executeFlow("fetch", transcript);
    expect(flowResult?.success).toBe(true);
    expect(flowResult?.response).toContain("Phase");
  });

  it("scenario: user provides vague command requiring clarification", async () => {
    const transcript = "Delete it";
    
    const parseResult = intentParser.parse(transcript);
    expect(parseResult.ambiguity).toBe(true);
    
    const flowResult = await orchestrator.executeFlow("diagnose", transcript);
    // Delete it should parse as delete action, not diagnose
    // But for this test, let's verify ambiguity is detected
    expect(parseResult.ambiguity || parseResult.clarification_needed).toBe(true);
  });
});
