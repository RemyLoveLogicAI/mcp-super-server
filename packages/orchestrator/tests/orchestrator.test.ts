/**
 * Orchestrator Tests
 */

import { describe, it, expect } from "vitest";
import { createOrchestrator, RealToolExecutor } from "../src/index";

describe("Multi-Agent Orchestration", () => {
  it("should execute a plan with real tools", async () => {
    const executor = new RealToolExecutor();
    const orchestrator = createOrchestrator(
      { agent_id: "agent-1", default_budget: { max_tool_calls: 5 } },
      executor,
    );

    const plan = await orchestrator.createPlan("Check weather", [
      { tool_id: "weather", input: { city: "San Francisco" } },
      { tool_id: "read:file", input: { path: "/tmp/test.txt" } },
    ]);

    const result = await orchestrator.executePlan(plan.plan_id);

    expect(result.status).toBe("completed");
    expect(result.steps[0]?.status).toBe("completed");
  });

  it("should continue later steps but fail the plan when a step fails", async () => {
    const executor = new RealToolExecutor();
    const orchestrator = createOrchestrator(
      { agent_id: "agent-1", default_budget: { max_tool_calls: 5 } },
      executor,
    );

    const plan = await orchestrator.createPlan("Mixed success", [
      { tool_id: "weather", input: { city: "SF" }, continue_on_failure: true },
      { tool_id: "nonexistent", input: {}, continue_on_failure: true },
      { tool_id: "search", input: { query: "test" } },
    ]);

    const result = await orchestrator.executePlan(plan.plan_id);

    expect(result.status).toBe("failed");
    expect(result.steps[0]?.status).toBe("completed");
    expect(result.steps[1]?.status).toBe("failed");
    expect(result.steps[2]?.status).toBe("completed");
  });

  describe("createPlan validation", () => {
    it("should reject empty goals", async () => {
      const executor = new RealToolExecutor();
      const orchestrator = createOrchestrator(
        { agent_id: "agent-1", default_budget: { max_tool_calls: 5 } },
        executor,
      );

      await expect(orchestrator.createPlan("", ["weather"])).rejects.toThrow("Goal cannot be empty");
      await expect(orchestrator.createPlan("   ", ["weather"])).rejects.toThrow("Goal cannot be empty");
    });

    it("should reject plans with no tools", async () => {
      const executor = new RealToolExecutor();
      const orchestrator = createOrchestrator(
        { agent_id: "agent-1", default_budget: { max_tool_calls: 5 } },
        executor,
      );

      await expect(orchestrator.createPlan("Do something", [])).rejects.toThrow(
        "At least one tool is required to create a plan",
      );
    });

    it("should reject empty tool_id", async () => {
      const executor = new RealToolExecutor();
      const orchestrator = createOrchestrator(
        { agent_id: "agent-1", default_budget: { max_tool_calls: 5 } },
        executor,
      );

      await expect(
        orchestrator.createPlan("Bad tool", [{ tool_id: "   " }]),
      ).rejects.toThrow("has an empty tool_id");
    });
  });

  describe("budget overflow", () => {
    it("should reject plans exceeding max_tool_calls budget", async () => {
      const executor = new RealToolExecutor();
      const orchestrator = createOrchestrator(
        { agent_id: "agent-1", default_budget: { max_tool_calls: 2 } },
        executor,
      );

      await expect(
        orchestrator.createPlan("Too many tools", ["weather", "search", "read:file"]),
      ).rejects.toThrow("Requested tool count exceeds budget: 3 > 2");
    });

    it("should enforce budget counter during execution", async () => {
      const executor = new RealToolExecutor();
      const orchestrator = createOrchestrator(
        { agent_id: "agent-1", default_budget: { max_tool_calls: 3 } },
        executor,
      );

      // Create a plan within budget
      const plan = await orchestrator.createPlan("Three tools", [
        "weather",
        "search", 
        "read:file",
      ]);

      const result = await orchestrator.executePlan(plan);

      // All 3 tools should execute successfully within budget
      expect(result.status).toBe("completed");
      expect(result.steps.filter((s) => s.status === "completed")).toHaveLength(3);
    });
  });

  describe("dependency chains", () => {
    it("should execute steps in dependency order", async () => {
      const executionOrder: string[] = [];
      const executor: RealToolExecutor = new (class extends RealToolExecutor {
        async execute(tool_id: string, input: Record<string, unknown>) {
          executionOrder.push(tool_id);
          return super.execute(tool_id, input);
        }
      })();

      const orchestrator = createOrchestrator(
        { agent_id: "agent-1", default_budget: { max_tool_calls: 10 } },
        executor,
      );

      const plan = await orchestrator.createPlan("Dep chain", [
        { tool_id: "weather", input: { city: "SF" } }, // step-1
        { tool_id: "search", input: { query: "test" }, depends_on: ["step-1"] }, // step-2
        { tool_id: "read:file", input: { path: "/tmp" }, depends_on: ["step-2"] }, // step-3
      ]);

      const result = await orchestrator.executePlan(plan);

      expect(result.status).toBe("completed");
      expect(executionOrder).toEqual(["weather", "search", "read:file"]);
    });

    it("should fail plan immediately when step fails without continue_on_failure, leaving dependent steps pending", async () => {
      const executor = new RealToolExecutor();
      const orchestrator = createOrchestrator(
        { agent_id: "agent-1", default_budget: { max_tool_calls: 10 } },
        executor,
      );

      const plan = await orchestrator.createPlan("Broken dep", [
        { tool_id: "nonexistent", input: {} }, // step-1 - will fail, no continue_on_failure
        { tool_id: "search", input: { query: "test" }, depends_on: ["step-1"] }, // step-2
      ]);

      const result = await orchestrator.executePlan(plan);

      // Plan fails immediately when step-1 fails
      expect(result.status).toBe("failed");
      expect(result.steps[0]?.status).toBe("failed");
      // step-2 never gets processed, stays pending
      expect(result.steps[1]?.status).toBe("pending");
    });

    it("should skip dependent step with continue_on_failure when dependency fails", async () => {
      const executor = new RealToolExecutor();
      const orchestrator = createOrchestrator(
        { agent_id: "agent-1", default_budget: { max_tool_calls: 10 } },
        executor,
      );

      const plan = await orchestrator.createPlan("Continue on failure", [
        { tool_id: "nonexistent", input: {}, continue_on_failure: true }, // step-1
        { tool_id: "search", input: { query: "test" }, depends_on: ["step-1"], continue_on_failure: true }, // step-2
        { tool_id: "weather", input: { city: "SF" } }, // step-3 - independent
      ]);

      const result = await orchestrator.executePlan(plan);

      expect(result.steps[0]?.status).toBe("failed");
      expect(result.steps[1]?.status).toBe("failed"); // dep failed, so this fails too
      expect(result.steps[2]?.status).toBe("completed"); // independent, should complete
    });
  });
});
