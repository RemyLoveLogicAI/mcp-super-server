import { describe, expect, it } from "vitest";
import { Arcade, createLedgermonGame, MemoryApprovalStore } from "@mss/games";
import { createMCPServer } from "../src/server.js";

describe("super-server hosts the arcade", () => {
  it("routes game tools through the arcade (read-only runs, with a real handler)", async () => {
    const server = createMCPServer({ gateMode: "write_approval" });
    server.attachArcade(new Arcade(new MemoryApprovalStore()).register(createLedgermonGame()));
    const { sessionId } = server.createVoiceSession("user_001", "custom");
    const r: any = await server.invokeTool(sessionId, "ledgermon:battle", {
      a_did: "did:zo:remy-main", a: { spd: 80, sta: 50, acc: 90, tem: 20, app: 40 },
      b_did: "did:zo:remy-r1", b: { spd: 60, sta: 50, acc: 70, tem: 10, app: 30 },
    });
    expect(r.decision).toBe("allow");
    expect(r.result.data.winner_did).toBe("did:zo:remy-main");
  });

  it("irreversible game tools come back with an approval id instead of acting", async () => {
    const irreversible = {
      id: "vault", name: "Vault", description: "test", status: "live" as const,
      tools: [{ descriptor: { tool_id: "vault:burn", version: "1", name: "burn", description: "permanent", capabilities: ["write"],
                              side_effect_class: "irreversible_write" as const }, inputSchema: { type: "object" as const, properties: {} },
                handler: async () => ({ text: "burned" }) }],
      health: async () => ({ ok: true, detail: "" }),
    };
    const server = createMCPServer();
    server.attachArcade(new Arcade(new MemoryApprovalStore()).register(irreversible));
    const r: any = await server.invokeTool("s", "vault:burn", {});
    expect(r.decision).toBe("require_human");
    expect(r.approval_id).toMatch(/^apv_/);
  });

  it("registerTool now keeps a real handler", async () => {
    const server = createMCPServer({ gateMode: "permissive" });
    server.registerTool({ tool_id: "echo", version: "1", capabilities: ["read"], side_effect_class: "read_only" }, async (i) => ({ echoed: i }));
    const plan: any = await server.planAndExecute("s", "echo", ["echo"]);
    expect(JSON.stringify(plan)).toContain("echoed");
  });
});
