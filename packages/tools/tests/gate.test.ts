/**
 * @mss/tools - Tool Gate Unit Tests
 * Tests for PolicyToolGate implementation
 */

import { describe, it, beforeEach, expect } from "vitest";
import {
  PolicyToolGate,
  BudgetTracker,
  createToolGate,
  createReadOnlyGate,
  createWriteApprovalGate,
  createPermissiveGate,
} from "../src/gate";
import type { GateContext } from "@mss/core/policies/gates";
import type { ToolDescriptor } from "@mss/core/resources/tool";
import {
  generateSessionId,
  generateCanonicalUserId,
  generateToolId,
} from "@mss/core/testing";
import type { SessionId, ToolId, CapabilityTag } from "@mss/core/ids";

function createTestTool(overrides: Partial<ToolDescriptor> = {}): ToolDescriptor {
  return {
    tool_id: generateToolId() as ToolId,
    version: "1.0.0",
    name: "Test Tool",
    description: "A test tool",
    capabilities: ["test" as CapabilityTag],
    side_effect_class: "read_only",
    min_trust_tier: undefined,
    schema_hash: "abc123",
    expected_latency_ms: 100,
    available: true,
    ...overrides,
  };
}

function createTestContext(
  toolId: ToolId,
  overrides: Partial<GateContext> = {}
): GateContext {
  return {
    canonical_user_id: generateCanonicalUserId(),
    session_id: generateSessionId(),
    tool_id: toolId,
    purpose: "test",
    requested_effect: "read_only",
    scopes: [],
    metadata: {},
    ...overrides,
  };
}

describe("PolicyToolGate", () => {
  let gate: PolicyToolGate;

  beforeEach(() => {
    gate = createToolGate();
  });

  describe("tool registration", () => {
    it("should register and retrieve tools", () => {
      const tool = createTestTool();
      gate.registerTool(tool);

      const retrieved = gate.getTool(tool.tool_id);
      expect(retrieved).toEqual(tool);
    });

    it("should unregister tools", () => {
      const tool = createTestTool();
      gate.registerTool(tool);
      gate.unregisterTool(tool.tool_id);

      expect(gate.getTool(tool.tool_id)).toBeUndefined();
    });
  });

  describe("evaluate - basic checks", () => {
    it("should deny unregistered tools", async () => {
      const context = createTestContext("unknown:tool" as ToolId);

      const result = await gate.evaluate(context);

      expect(result.decision).toBe("deny");
      expect(result.reason?.code).toBe("TOOL_NOT_FOUND");
    });

    it("should deny blocked tools", async () => {
      const tool = createTestTool();
      gate.registerTool(tool);

      const blockedGate = createToolGate({
        blockedTools: [tool.tool_id],
      });
      blockedGate.registerTool(tool);

      const context = createTestContext(tool.tool_id);
      const result = await blockedGate.evaluate(context);

      expect(result.decision).toBe("deny");
      expect(result.reason?.code).toBe("TOOL_BLOCKED");
    });

    it("should deny unavailable tools", async () => {
      const tool = createTestTool({ available: false });
      gate.registerTool(tool);

      const context = createTestContext(tool.tool_id);
      const result = await gate.evaluate(context);

      expect(result.decision).toBe("deny");
      expect(result.reason?.code).toBe("TOOL_UNAVAILABLE");
    });
  });

  describe("evaluate - budget enforcement", () => {
    it("should deny when call budget exceeded", async () => {
      const budgetGate = createToolGate({ maxCallsPerSession: 2 });
      const tool = createTestTool();
      budgetGate.registerTool(tool);

      const sessionId = generateSessionId();
      const context = createTestContext(tool.tool_id, { session_id: sessionId });

      // First two calls should succeed
      await budgetGate.evaluate(context);
      budgetGate.recordToolCall(sessionId, tool.tool_id);

      await budgetGate.evaluate(context);
      budgetGate.recordToolCall(sessionId, tool.tool_id);

      // Third call should be denied
      const result = await budgetGate.evaluate(context);

      expect(result.decision).toBe("deny");
      expect(result.reason?.code).toBe("BUDGET_EXCEEDED");
    });

    it("should deny when cost budget exceeded", async () => {
      const costGate = createToolGate({ maxCostPerSession: 100 });
      const tool = createTestTool();
      costGate.registerTool(tool);

      const sessionId = generateSessionId();
      const context = createTestContext(tool.tool_id, { session_id: sessionId });

      // Record high-cost calls
      costGate.recordToolCall(sessionId, tool.tool_id, 50);
      costGate.recordToolCall(sessionId, tool.tool_id, 50);

      const result = await costGate.evaluate(context);

      expect(result.decision).toBe("deny");
      expect(result.reason?.code).toBe("COST_EXCEEDED");
    });

    it("should track budget per session", async () => {
      const budgetGate = createToolGate({ maxCallsPerSession: 1 });
      const tool = createTestTool();
      budgetGate.registerTool(tool);

      const session1 = generateSessionId();
      const session2 = generateSessionId();

      budgetGate.recordToolCall(session1, tool.tool_id);

      // Session 1 should be denied
      const result1 = await budgetGate.evaluate(
        createTestContext(tool.tool_id, { session_id: session1 })
      );
      expect(result1.decision).toBe("deny");

      // Session 2 should still be allowed
      const result2 = await budgetGate.evaluate(
        createTestContext(tool.tool_id, { session_id: session2 })
      );
      expect(result2.decision).not.toBe("deny");
    });

    it("should reset budget on request", async () => {
      const budgetGate = createToolGate({ maxCallsPerSession: 1 });
      const tool = createTestTool();
      budgetGate.registerTool(tool);

      const sessionId = generateSessionId();
      budgetGate.recordToolCall(sessionId, tool.tool_id);

      // Should be denied
      let result = await budgetGate.evaluate(
        createTestContext(tool.tool_id, { session_id: sessionId })
      );
      expect(result.decision).toBe("deny");

      // Reset and retry
      budgetGate.resetBudget(sessionId);
      result = await budgetGate.evaluate(
        createTestContext(tool.tool_id, { session_id: sessionId })
      );
      expect(result.decision).not.toBe("deny");
    });
  });

  describe("evaluate - side effect policies", () => {
    it("should require human approval for irreversible writes by default", async () => {
      const tool = createTestTool({ side_effect_class: "irreversible_write" });
      gate.registerTool(tool);

      const context = createTestContext(tool.tool_id);
      const result = await gate.evaluate(context);

      expect(result.decision).toBe("require_human");
      expect(result.approval_required).toBe(true);
    });

    it("should auto-approve read-only tools with auto default", async () => {
      const autoGate = createToolGate({ defaultApproval: "auto" });
      const tool = createTestTool({ side_effect_class: "read_only" });
      autoGate.registerTool(tool);

      const context = createTestContext(tool.tool_id);
      const result = await autoGate.evaluate(context);

      expect(result.decision).toBe("allow");
    });
  });

  describe("evaluate - custom gates", () => {
    it("should run custom gates in order", async () => {
      const customGate = createToolGate({
        defaultApproval: "auto",
        customGates: [
          async (ctx) => {
            if (ctx.purpose === "blocked") return { decision: "deny" as const, reason: "blocked by custom gate" };
            return { decision: "allow" as const };
          },
        ],
      });
      const tool = createTestTool();
      customGate.registerTool(tool);

      // Normal purpose should pass
      let result = await customGate.evaluate(
        createTestContext(tool.tool_id, { purpose: "normal" })
      );
      expect(result.decision).toBe("allow");

      // Blocked purpose should be denied
      result = await customGate.evaluate(
        createTestContext(tool.tool_id, { purpose: "blocked" })
      );
      expect(result.decision).toBe("deny");
      expect(result.reason?.code).toBe("CUSTOM_GATE_DENIED");
    });

    it("should support require_human from custom gates", async () => {
      const customGate = createToolGate({
        defaultApproval: "auto",
        customGates: [
          async (ctx) => {
            if (ctx.purpose === "sensitive") return { decision: "require_human" as const };
            if (ctx.purpose === "blocked") return { decision: "deny" as const, reason: "blocked by custom gate" };
            return { decision: "allow" as const };
          },
        ],
      });
      const tool = createTestTool();
      customGate.registerTool(tool);

      const result = await customGate.evaluate(
        createTestContext(tool.tool_id, { purpose: "sensitive" })
      );

      expect(result.decision).toBe("require_human");
      expect(result.approval_required).toBe(true);
    });
  });
});

describe("BudgetTracker", () => {
  let tracker: BudgetTracker;

  beforeEach(() => {
    tracker = new BudgetTracker();
  });

  it("should create budget on first access", () => {
    const sessionId = generateSessionId();
    const budget = tracker.getOrCreate(sessionId);

    expect(budget.session_id).toBe(sessionId);
    expect(budget.calls_made).toBe(0);
    expect(budget.cost_spent).toBe(0);
  });

  it("should track calls", () => {
    const sessionId = generateSessionId();
    const toolId = generateToolId() as ToolId;

    tracker.recordCall(sessionId, toolId);
    tracker.recordCall(sessionId, toolId);

    const budget = tracker.getOrCreate(sessionId);
    expect(budget.calls_made).toBe(2);
    expect(budget.calls_by_tool.get(toolId)).toBe(2);
  });

  it("should track cost", () => {
    const sessionId = generateSessionId();
    const toolId = generateToolId() as ToolId;

    tracker.recordCall(sessionId, toolId, 10);
    tracker.recordCall(sessionId, toolId, 25);

    const budget = tracker.getOrCreate(sessionId);
    expect(budget.cost_spent).toBe(35);
  });

  it("should clear session budget", () => {
    const sessionId = generateSessionId();
    tracker.recordCall(sessionId, generateToolId() as ToolId);
    tracker.clear(sessionId);

    const budget = tracker.getOrCreate(sessionId);
    expect(budget.calls_made).toBe(0);
  });

  it("should clear all budgets", () => {
    const session1 = generateSessionId();
    const session2 = generateSessionId();

    tracker.recordCall(session1, generateToolId() as ToolId);
    tracker.recordCall(session2, generateToolId() as ToolId);
    tracker.clearAll();

    expect(tracker.getOrCreate(session1).calls_made).toBe(0);
    expect(tracker.getOrCreate(session2).calls_made).toBe(0);
  });
});

describe("factory functions", () => {
  describe("createReadOnlyGate", () => {
    it("should allow read-only effects", async () => {
      const gate = createReadOnlyGate();
      const tool = createTestTool({ side_effect_class: "read_only" });
      gate.registerTool(tool);

      const result = await gate.evaluate(
        createTestContext(tool.tool_id, { requested_effect: "read_only" })
      );

      expect(result.decision).toBe("allow");
    });

    it("should deny write effects", async () => {
      const gate = createReadOnlyGate();
      const tool = createTestTool({ side_effect_class: "reversible_write" });
      gate.registerTool(tool);

      const result = await gate.evaluate(
        createTestContext(tool.tool_id, { requested_effect: "reversible_write" })
      );

      expect(result.decision).toBe("deny");
    });
  });

  describe("createWriteApprovalGate", () => {
    it("should allow read-only without approval", async () => {
      const gate = createWriteApprovalGate();
      const tool = createTestTool({ side_effect_class: "read_only" });
      gate.registerTool(tool);

      const result = await gate.evaluate(
        createTestContext(tool.tool_id, { requested_effect: "read_only" })
      );

      expect(result.decision).toBe("allow");
    });

    it("should require human approval for writes", async () => {
      const gate = createWriteApprovalGate();
      const tool = createTestTool({ side_effect_class: "reversible_write" });
      gate.registerTool(tool);

      const result = await gate.evaluate(
        createTestContext(tool.tool_id, { requested_effect: "reversible_write" })
      );

      expect(result.decision).toBe("require_human");
    });
  });

  describe("createPermissiveGate", () => {
    it("should have high limits", async () => {
      const gate = createPermissiveGate();
      const tool = createTestTool();
      gate.registerTool(tool);

      const sessionId = generateSessionId();

      // Should allow many calls
      for (let i = 0; i < 100; i++) {
        gate.recordToolCall(sessionId, tool.tool_id);
      }

      const result = await gate.evaluate(
        createTestContext(tool.tool_id, { session_id: sessionId })
      );

      expect(result.decision).not.toBe("deny");
    });
  });
});
