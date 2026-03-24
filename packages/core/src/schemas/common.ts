/**
 * Common Zod schemas used across events, resources, and contracts.
 * Whitepaper §5, §7
 */

import { z } from "./zod.js";

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
// ─────────────────────────────────────────────────────────────────────────────

export const ISODateTime = z.string().min(10).describe("ISO 8601 datetime string");
export const NonEmptyString = z.string().min(1);
export const Hash = z.string().min(16).describe("SHA-256 or similar hash");

// ─────────────────────────────────────────────────────────────────────────────
// TTS State (Voice Transport)
// ─────────────────────────────────────────────────────────────────────────────

export const TTSStreamState = z.enum([
  "idle",      // No TTS active
  "playing",   // TTS currently streaming
  "paused",    // TTS paused (rare)
  "canceled"   // TTS canceled due to interrupt
]);
export type TTSStreamState = z.infer<typeof TTSStreamState>;
