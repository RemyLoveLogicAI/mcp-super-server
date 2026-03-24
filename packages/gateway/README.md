# @mss/gateway — Gateway Layer

**Whitepaper mapping:** §4.2.1 Gateway Layer

## Responsibilities

- Channel adapters for Discord, Telegram, WhatsApp, Web, R1, Mobile
- Transport termination (WebSocket, gRPC)
- Protocol translation to internal MCP format
- Initial request validation

## Trust Boundary

Gateway is **semi_trusted** (Whitepaper §7.1).
It cannot bypass policy gates or access raw credentials.

## Contracts Used

- `@mss/core/events` — All inbound requests become events
- `@mss/core/resources` — Routes to appropriate resource handlers
- `@mss/core/policies` — Applies initial trust tier classification

## Anti-Drift Rule

No protocol primitives may be defined here.
All event types and resources must come from `@mss/core`.
