# @mss/voice-command

Voice Command Interface for the MCP Super-Server - Voice-as-command architecture.

## Overview

This package provides a complete voice command interface that transforms voice transcripts into actionable commands, routes them to appropriate MCP tools, and executes them with full context awareness and safety confirmations.

## Architecture

```
Voice Transcript
     ↓
Intent Parser (src/intent.ts)
     ↓
Structured Intent { action, target, confidence }
     ↓
MCP Tool Router (src/router.ts)
     ↓
Tool Match with Parameters
     ↓
Confirmation Manager (src/confirm.ts) ←── High-risk actions
     ↓
Action Executor (src/executor.ts)
     ↓
FSM Integration (src/fsm-integration.ts) ←── VoiceSessionFSM events
```

## Key Components

### Intent Parser (`src/intent.ts`)

Parses voice transcripts into structured commands with confidence scoring.

**Supported Command Patterns:**
- `"Deploy [project]"` → `{ action: "deploy", target: project }`
- `"Check errors"` → `{ action: "diagnose", scope: "errors" }`
- `"Show roadmap"` → `{ action: "fetch", resource: "roadmap" }`
- `"List [resource]"` → `{ action: "list", target: resource }`
- `"Run [script]"` → `{ action: "execute", target: script }`
- And more...

**Features:**
- Confidence scoring (0.0 - 1.0)
- Ambiguity detection
- Clarification prompts
- Fuzzy matching for partial commands

### MCP Tool Router (`src/router.ts`)

Maps intents to appropriate MCP tools using capability matching.

**Features:**
- Tool registry with capability definitions
- Match scoring for tool selection
- Support for tool chaining
- Automatic parameter extraction

**Default Tools:**
- `mss:deploy` - Deploy projects
- `mss:diagnose` - Diagnose errors and fetch logs
- `mss:fetch` - Fetch resources (roadmaps, status, docs)
- `mss:list` - List projects, files, services
- `mss:execute` - Execute scripts and commands
- `mss:build` - Build projects
- `mss:test` - Run tests
- `mss:open` - Open files
- `mss:create` - Create resources
- `mss:delete` - Delete resources (destructive)
- `mss:stop/start/restart` - Service management
- `mss:help` - Show help
- `mss:status` - Show status

### Action Executor (`src/executor.ts`)

Executes tool calls with retry logic, progress reporting, and error handling.

**Features:**
- Retry with exponential backoff
- Progress events for long-running operations
- Cancellation support
- Gate evaluation before execution
- Session budget tracking

### Context Awareness (`src/context.ts`)

Maintains voice session context including project state and conversation history.

**Features:**
- Entity resolution (project names, file paths, services)
- Conversation history tracking
- Working directory awareness
- FSM state awareness

### Confirmation Dialogs (`src/confirm.ts`)

Voice-based confirmation for high-risk actions.

**Severity Levels:**
- `low` - Minor operation
- `medium` - May have side effects
- `high` - Cannot be easily undone
- `critical` - Destructive action

**Features:**
- Verbal yes/no parsing
- Timeout handling
- Retry prompts
- Severity-based confirmation

### Conversation Flows (`src/flows.ts`)

Pre-built voice command flows for common operations.

**Implemented Flows:**
- **Deploy Flow** - Full deployment pipeline with confirmation
- **Diagnose Errors Flow** - Error checking with summary
- **Fetch Roadmap Flow** - Roadmap retrieval with summarization

### FSM Integration (`src/fsm-integration.ts`)

Hooks voice-command into the VoiceSessionFSM.

**Integration Points:**
- AUDIO_START → Command received
- ASR_FINAL → Transcript captured
- INTENT_RESOLVED → Intent processed
- TOOL_CALL_START/COMPLETE → Tool lifecycle
- BARGE_IN → Cancellation handling
- TTS_START/COMPLETE → Response speaking

## Usage

```typescript
import {
  createIntentParser,
  createMCPToolRouter,
  createActionExecutor,
  createVoiceCommandContext,
  createConfirmationManager,
  createFlowOrchestrator,
  createFSMIntegration,
} from "@mss/voice-command";

// Initialize components
const intentParser = createIntentParser();
const router = createMCPToolRouter();
const executor = createActionExecutor();
const context = createVoiceCommandContext(sessionId, userId, channel);
const confirmationManager = createConfirmationManager();

// Create flow orchestrator
const flows = createFlowOrchestrator(
  intentParser,
  router,
  executor,
  context,
  confirmationManager
);

// Create FSM integration
const fsmIntegration = createFSMIntegration();
fsmIntegration.attach(fsm, context);

// Bridge executor events to FSM
const bridge = new ExecutorToFSMBridge(fsmIntegration);
executor.onEvent(bridge.createExecutorEventHandler());

// Execute a voice command
const result = await flows.executeFlow("deploy", "Deploy SAK project");
console.log(result.response);
```

## Testing

```bash
pnpm build
pnpm test
```

## Integration with Voice FSM

The voice-command package integrates with `VoiceSessionFSM`:

1. When `ASR_FINAL` is received → transcript is passed to intent parser
2. When `INTENT_RESOLVED` is received → intent is routed to tools
3. Tool execution emits `TOOL_CALL_START`/`TOOL_CALL_COMPLETE` to FSM
4. `BARGE_IN` during execution cancels pending operations
5. Response generation triggers `TTS_START`/`TTS_COMPLETE`

## Safety Features

- **Confirmation required** for: deploy, delete, stop, restart
- **Gate evaluation** via `PolicyToolGate`
- **Session budgets** track tool calls per session
- **Barge-in support** cancels in-progress operations
- **Timeout handling** prevents hanging operations
