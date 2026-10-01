/**
 * Human approval for irreversible game actions.
 *
 * The model can request an irreversible act; only a human can approve it (from the `mss`
 * CLI, never through an MCP tool). An approval is bound to the exact tool + input that was
 * requested, can be used once, and expires. The store is a directory of JSON files so the
 * MCP process and the CLI process share it without a server.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ApprovalStatus = "pending" | "approved" | "denied" | "used" | "expired";

export interface Approval {
  id: string;
  tool_id: string;
  input_hash: string;
  input: Record<string, unknown>;
  summary: string;
  requested_by: string;
  surface: string;
  status: ApprovalStatus;
  created_at: string;
  expires_at: string;
  decided_by?: string;
  decided_at?: string;
}

export interface ApprovalStore {
  put(a: Approval): void;
  get(id: string): Approval | undefined;
  list(): Approval[];
}

export const APPROVAL_TTL_MS = 15 * 60 * 1000;

/** Stable hash of a tool call: key order does not matter. */
export function inputHash(toolId: string, input: Record<string, unknown>): string {
  const canon = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(canon)
      : v && typeof v === "object" ? Object.fromEntries(Object.keys(v as object).sort().map(k => [k, canon((v as any)[k])]))
      : v;
  return createHash("sha256").update(JSON.stringify([toolId, canon(input)])).digest("hex");
}

export function newApprovalId(): string {
  return "apv_" + randomBytes(5).toString("hex");
}

export class MemoryApprovalStore implements ApprovalStore {
  private m = new Map<string, Approval>();
  put(a: Approval) { this.m.set(a.id, { ...a }); }
  get(id: string) { const a = this.m.get(id); return a ? { ...a } : undefined; }
  list() { return [...this.m.values()].map(a => ({ ...a })); }
}

export class FileApprovalStore implements ApprovalStore {
  constructor(readonly dir: string = join(process.env.MSS_HOME ?? join(homedir(), ".mss"), "approvals")) {
    mkdirSync(this.dir, { recursive: true, mode: 0o700 });
  }
  put(a: Approval) {
    const tmp = join(this.dir, `.${a.id}.${process.pid}.tmp`);
    writeFileSync(tmp, JSON.stringify(a, null, 2), { mode: 0o600 });
    renameSync(tmp, join(this.dir, `${a.id}.json`));            // atomic replace
  }
  get(id: string) {
    if (!/^apv_[0-9a-f]{10}$/.test(id)) return undefined;
    try { return JSON.parse(readFileSync(join(this.dir, `${id}.json`), "utf8")) as Approval; }
    catch { return undefined; }
  }
  list() {
    return readdirSync(this.dir).filter(f => /^apv_[0-9a-f]{10}\.json$/.test(f))
      .map(f => this.get(f.slice(0, -5))!).filter(Boolean)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
}

/** Mark expired approvals as such so listings stay honest. */
export function refresh(a: Approval, now = Date.now()): Approval {
  if ((a.status === "pending" || a.status === "approved") && Date.parse(a.expires_at) < now) {
    return { ...a, status: "expired" };
  }
  return a;
}
