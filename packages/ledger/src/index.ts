/**
 * @mss/ledger — Event Ledger
 * Whitepaper §4.2.8
 * 
 * This package will implement:
 * - Append-only event storage
 * - Replay for state derivation
 * - Timeline branching
 * - Integrity verification
 * 
 * Default backend: Supabase/Postgres
 */

// Re-export core types
export type { CoreEvent } from "@mss/core/events";

export type { 
  EventLedger, 
  AppendResult, 
  ReplayCursor,
  ReplayedEvent,
  ForkParams,
  ForkResult,
  LedgerQuery 
} from "@mss/core/contracts";

// ─────────────────────────────────────────────────────────────────────────────
// Ledger Implementation Types (stub)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ledger storage backend configuration.
 */
export type LedgerBackendConfig = 
  | { type: "postgres"; connection_string: string }
  | { type: "supabase"; url: string; key: string }
  | { type: "memory" }; // For testing

/**
 * Ledger factory.
 */
export interface LedgerFactory {
  /** Create a ledger instance */
  create(config: LedgerBackendConfig): Promise<import("@mss/core").EventLedger>;
}

/**
 * Integrity verification result.
 */
export type IntegrityResult = {
  valid: boolean;
  checked_events: number;
  first_invalid_index?: number;
  error?: string;
};

// Implementation intentionally deferred (contract-first)

// ─────────────────────────────────────────────────────────────────────────────
// Supabase ledger stub
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Supabase-backed ledger (not yet implemented).
 */
export function createSupabaseLedger(config: { supabaseUrl: string; supabaseServiceKey: string }): never {
  throw new Error("createSupabaseLedger not implemented");
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory implementation
// ─────────────────────────────────────────────────────────────────────────────

export { InMemoryLedger, createInMemoryLedger } from "./memory.js";
