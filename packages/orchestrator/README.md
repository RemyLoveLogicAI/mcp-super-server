# @mss/orchestrator — Agent Orchestrator

**Whitepaper mapping:** §4.2.4 Agent Orchestrator

## Responsibilities

- Agent planning and goal decomposition
- Multi-agent delegation and handoff
- Tool call budget management
- Coordination between agents (NPC swarms, system agents, user agents)

## Contracts Used

- `@mss/core/events` — `ToolCallRequested`, `ToolCallCompleted`, `ToolCallCanceled`
- `@mss/core/contracts` — `ToolInvoker` for executing tool calls
- `@mss/core/policies` — Policy gates for tool approval

## Planning Model

The orchestrator MUST:
1. Receive intent from voice/chat layer
2. Decompose into tool call plan
3. Check budget constraints
4. Apply policy gates
5. Execute or delegate
6. Handle results/failures

## Anti-Drift Rule

Agent coordination protocols must be defined in `@mss/core/contracts`.
This package implements the orchestration logic.
