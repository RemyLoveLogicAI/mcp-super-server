/**
 * @mss/voice-command - Voice Command Interface
 * Voice-as-command architecture for the MCP Super-Server
 */

// Types
export * from "./types";

// Intent Parser
export { IntentParser, createIntentParser, type IntentParseResult } from "./intent";

// MCP Tool Router
export { ToolRegistry, MCPToolRouter, createMCPToolRouter, type ToolCapability } from "./router";
export type { RoutingResult, ToolMatch } from "./types";

// Action Executor
export {
  ActionExecutor,
  createActionExecutor,
  type ExecutorConfig,
  type ExecutorEvent,
  type ExecutorEventHandler,
} from "./executor";
export type { ExecutionResult, ExecutionStatus } from "./types";

// Context Awareness
export {
  VoiceCommandContextManager,
  createVoiceCommandContext,
  ConversationHistory,
  EntityResolver,
  type ResolvedEntity,
} from "./context";

// Confirmation Dialogs
export {
  ConfirmationManager,
  createConfirmationManager,
  type ConfirmationConfig,
  type ConfirmationHandler,
} from "./confirm";

// Conversation Flows
export {
  FlowOrchestrator,
  createFlowOrchestrator,
  DeployFlow,
  DiagnoseErrorsFlow,
  FetchRoadmapFlow,
  type FlowResult,
} from "./flows";

// FSM Integration
export {
  FSMIntegration,
  createFSMIntegration,
  ExecutorToFSMBridge,
  type FSMIntegrationEvent,
  type FSMIntegrationEventHandler,
} from "./fsm-integration";
