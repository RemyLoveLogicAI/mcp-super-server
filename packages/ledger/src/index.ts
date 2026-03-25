/**
 * @mss/ledger — Event Ledger
 * Whitepaper §4.2.8
 * 
 * This package implements:
 * - Append-only event storage
 * - Replay for state derivation
 * - Timeline branching
 * - Integrity verification
 * 
 * Backends:
 * - Supabase/Postgres (production)
 * - In-memory (testing/development)
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
// Ledger Implementation Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ledger storage backend configuration.
 */
export type LedgerBackendConfig = 
  | { type: "postgres"; connection_string: string }
  | { type: "supabase"; url: string; key: string; debug?: boolean }
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

// ─────────────────────────────────────────────────────────────────────────────
// Supabase ledger (production)
// ─────────────────────────────────────────────────────────────────────────────

export {
  createSupabaseLedger,
  SupabaseLedger,
  type SupabaseLedgerConfig,
} from "./supabase/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory implementation (testing)
// ─────────────────────────────────────────────────────────────────────────────

export { InMemoryLedger, createInMemoryLedger } from "./memory.js";
