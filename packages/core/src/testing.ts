/**
 * @mss/core - Test Utilities
 * Shared helpers for testing across packages
 */

import { z } from "zod";
import {
  UUID,
  SessionId,
  TurnId,
  EventId,
  ToolCallId,
  WorldId,
  TimelineId,
  CanonicalUserId,
  ToolId,
} from "./ids.js";
import { EventActor } from "./events/base.js";
import { CoreEvent } from "./events/index.js";
import { VoiceTurnStarted, VoiceTurnFinalized } from "./events/voice.js";
import { ToolCallRequested, ToolCallCompleted, ToolCallCanceled } from "./events/tools.js";
import { WorldEventAppended } from "./events/world.js";

// ============================================================================
// ID Generators
// ============================================================================

export function generateUUID(): UUID {
  return crypto.randomUUID() as UUID;
}

export function generateSessionId(): SessionId {
  return crypto.randomUUID() as SessionId;
}

export function generateEventId(): EventId {
  return crypto.randomUUID() as EventId;
}

export function generateToolCallId(): ToolCallId {
  return crypto.randomUUID() as ToolCallId;
}

export function generateWorldId(): WorldId {
  return crypto.randomUUID() as WorldId;
}

export function generateTimelineId(): TimelineId {
  return crypto.randomUUID() as TimelineId;
}

export function generateCanonicalUserId(): CanonicalUserId {
  return crypto.randomUUID() as CanonicalUserId;
}

export function generateToolId(prefix: string = "tool"): ToolId {
  return `${prefix}:${crypto.randomUUID().slice(0, 8)}` as ToolId;
}

// ============================================================================
// Actor Factories
// ============================================================================

export function createUserActor(userId?: CanonicalUserId, platform?: string): EventActor {
  return {
    canonical_user_id: userId ?? generateCanonicalUserId(),
    platform,
  };
}

export function createAgentActor(agentId: string): EventActor {
  return { agent_id: agentId };
}

export function createSystemActor(): EventActor {
  return { system: true };
}

// ============================================================================
// Event Factories
// ============================================================================

export function createVoiceTurnStarted(
  overrides: Partial<VoiceTurnStarted> = {}
): VoiceTurnStarted {
  return {
    event_id: generateEventId(),
    event_type: "VoiceTurnStarted",
    timestamp: new Date().toISOString(),
    actor: createUserActor(),
    prev_hash: undefined,
    hash: undefined,
    session_id: generateSessionId(),
    turn_id: 1 as unknown as TurnId,
    channel: "test",
    asr_partial: undefined,
    ...overrides,
  };
}

export function createVoiceTurnFinalized(
  overrides: Partial<VoiceTurnFinalized> = {}
): VoiceTurnFinalized {
  return {
    event_id: generateEventId(),
    event_type: "VoiceTurnFinalized",
    timestamp: new Date().toISOString(),
    actor: createUserActor(),
    prev_hash: undefined,
    hash: undefined,
    session_id: generateSessionId(),
    turn_id: 1 as unknown as TurnId,
    asr_final: "test utterance",
    intent: undefined,
    embeddings_ref: undefined,
    was_interrupted: false,
    ...overrides,
  };
}

export function createToolCallRequested(
  overrides: Partial<ToolCallRequested> = {}
): ToolCallRequested {
  return {
    event_id: generateEventId(),
    event_type: "ToolCallRequested",
    timestamp: new Date().toISOString(),
    actor: createAgentActor("test-agent"),
    prev_hash: undefined,
    hash: undefined,
    tool_call_id: generateToolCallId(),
    tool_id: generateToolId(),
    tool_version: "1.0.0",
    purpose: "test",
    side_effect_class: "read_only",
    timeout_ms: 5000,
    approval: "auto",
    scopes: [],
    input: {},
    ...overrides,
  };
}

export function createToolCallCompleted(
  overrides: Partial<ToolCallCompleted> = {}
): ToolCallCompleted {
  return {
    event_id: generateEventId(),
    event_type: "ToolCallCompleted",
    timestamp: new Date().toISOString(),
    actor: createSystemActor(),
    prev_hash: undefined,
    hash: undefined,
    tool_call_id: generateToolCallId(),
    ok: true,
    output: { result: "success" },
    error: undefined,
    duration_ms: 100,
    ...overrides,
  };
}

export function createToolCallCanceled(
  overrides: Partial<ToolCallCanceled> = {}
): ToolCallCanceled {
  return {
    event_id: generateEventId(),
    event_type: "ToolCallCanceled",
    timestamp: new Date().toISOString(),
    actor: createSystemActor(),
    prev_hash: undefined,
    hash: undefined,
    tool_call_id: generateToolCallId(),
    reason: "test_cancellation",
    partial_execution: false,
    ...overrides,
  };
}

export function createWorldEventAppended(
  overrides: Partial<WorldEventAppended> = {}
): WorldEventAppended {
  return {
    event_id: generateEventId(),
    event_type: "WorldEventAppended",
    timestamp: new Date().toISOString(),
    actor: createAgentActor("world-engine"),
    prev_hash: undefined,
    hash: undefined,
    world_id: generateWorldId(),
    timeline_id: generateTimelineId(),
    event_index: 0,
    world_event_type: "test.event",
    payload: { data: "test" },
    ...overrides,
  };
}

// ============================================================================
// Assertion Helpers
// ============================================================================

export function assertEventType<T extends CoreEvent>(
  event: CoreEvent,
  expectedType: T["event_type"]
): asserts event is T {
  if (event.event_type !== expectedType) {
    throw new Error(
      `Expected event type "${expectedType}", got "${event.event_type}"`
    );
  }
}

export function assertHashChain(events: Array<{ hash: string; prev_hash: string | null }>): void {
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];
    if (!prev || !curr) continue;
    if (curr.prev_hash !== prev.hash) {
      throw new Error(
        `Hash chain broken at index ${i}: expected prev_hash "${prev.hash}", got "${curr.prev_hash}"`
      );
    }
  }
}

// ============================================================================
// Time Helpers
// ============================================================================

export function isoNow(): string {
  return new Date().toISOString();
}

export function isoOffset(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

export function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

// ============================================================================
// Wait Helpers
// ============================================================================

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitUntil(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number = 5000,
  intervalMs: number = 50
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await condition()) return;
    await wait(intervalMs);
  }
  throw new Error(`Condition not met within ${timeoutMs}ms`);
}
