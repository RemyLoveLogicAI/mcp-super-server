# @mss/voice — Voice Transport Layer

**Whitepaper mapping:** §4.2.2 Voice Transport Layer + §5 Pillar 1 + Innovation #2

## Responsibilities

- WebRTC session management
- Streaming STT with partial hypotheses
- Interruptible TTS generation
- Barge-in detection and deterministic cancellation
- Voice session state as protocol resource

## Patent Surface

**Innovation #2: Voice-Native MCP Transport Layer**

Voice transport where MCP calls are:
- Initiated from live voice turns
- Tied to voice session state resources
- Executed with interrupt semantics

## Contracts Used

- `@mss/core/events` — `VoiceTurnStarted`, `VoiceTurnFinalized`
- `@mss/core/resources` — `VoiceSessionStateResource`
- `@mss/core/contracts` — Tool cancellation via `ToolInvoker.cancel()`

## Critical Requirement

Voice interruption semantics MUST emit `ToolCallCanceled` events for any pending tool calls when barge-in occurs.

No implementation in this package may bypass the event ledger.
