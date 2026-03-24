# @mss/mesh — Mesh Router

**Whitepaper mapping:** §4.2.9 Mesh Router + §5 Pillar 3

## Responsibilities

- Capability discovery
- Trust tier routing
- Latency/locality routing
- Cost budget routing
- Dependency injection for agents
- Federation support

## Routing Algorithm

Requests are routed by:
1. **Capability match** — Server must have required capabilities
2. **Trust tier** — Server must meet minimum trust
3. **Latency + locality** — Prefer nearby, fast servers
4. **Cost budget** — Respect cost constraints

## Federation

Multi-server discovery supports:
- Static configuration
- Service registry (Consul, etc.)
- Decentralized gossip (optional)

## Contracts Used

- `@mss/core/contracts` — `MeshRouter`, `DependencyResolver`
- `@mss/core/policies` — `ServerDescriptor`, `TrustTier`

## Dependency Injection

Agents declare required dependencies:
```typescript
{
  needs: ["voice_session_state", "world_state", "ssh_exec", "calendar_read"]
}
```

Router resolves provider(s) dynamically.
