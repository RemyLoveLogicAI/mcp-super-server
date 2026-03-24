# @mss/tools — Tool Manager

**Whitepaper mapping:** §4.2.5 Tool Manager + §5 Pillar 2

## Responsibilities

- Capability registry (discovery, registration)
- Sandbox execution (ephemeral by default)
- Credential scoping (JIT, tool-scoped)
- Side effect classification enforcement

## Tool Types (Whitepaper §5 Pillar 2)

| Type | Description |
|------|-------------|
| `local_sandbox` | Safe interpreter / workflow |
| `desktop_control` | UI automation |
| `remote_shell` | SSH-MCP |
| `cloud_provisioning` | AWS/Azure/GCP |
| `messaging` | OpenClaw gateway integration |

## Contracts Used

- `@mss/core/contracts` — `ToolInvoker` interface
- `@mss/core/resources` — `ToolDescriptor`, `ToolRegistryEntry`
- `@mss/core/policies` — Side effect classification, approval policies

## Sandboxing Requirements

- Local sandboxes MUST be ephemeral by default
- Persistent sandboxes MUST use explicit retention policy + encryption
- All sandbox state is auditable

## Anti-Drift Rule

Tool descriptors and the `ToolInvoker` interface are defined in `@mss/core`.
This package implements the manager and sandboxes.
