import { describe, expect, it } from "vitest";
import { Arcade, MemoryApprovalStore, type GameModule } from "@mss/games";
import { ArcadeToolExecutor } from "../src/index.js";

/** An in-memory fixture game — no live daemon, exercises all three Arcade decisions. */
function testGame(): GameModule {
  return {
    id: "test",
    name: "Test",
    status: "live",
    description: "in-memory fixture for ArcadeToolExecutor tests",
    tools: [
      {
        descriptor: { tool_id: "test:ping", version: "0.0.0", name: "ping", description: "ping",
                      capabilities: [], side_effect_class: "read_only", available: true },
        inputSchema: { type: "object", properties: {} },
        handler: async () => ({ text: "pong" }),
      },
      {
        descriptor: { tool_id: "test:boom", version: "0.0.0", name: "boom", description: "irreversible fixture",
                      capabilities: [], side_effect_class: "irreversible_write", available: true },
        inputSchema: { type: "object", properties: {} },
        handler: async () => ({ text: "boomed" }),
      },
    ],
    async health() { return { ok: true, detail: "test" }; },
  };
}

function newExecutor() {
  const arcade = new Arcade(new MemoryApprovalStore()).register(testGame());
  return new ArcadeToolExecutor(arcade, "tester", "test-surface");
}

describe("ArcadeToolExecutor", () => {
  it("maps an allowed read-only call to ok:true with the tool's output", async () => {
    const result = await newExecutor().execute("test:ping", {});
    expect(result.ok).toBe(true);
    expect(result.output).toEqual({ text: "pong" });
  });

  it("maps an irreversible call awaiting human approval to ok:false", async () => {
    const result = await newExecutor().execute("test:boom", {});
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/human must approve/i);
  });

  it("maps an unknown tool to ok:false with a deny reason", async () => {
    const result = await newExecutor().execute("test:missing", {});
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unknown tool/i);
  });
});
