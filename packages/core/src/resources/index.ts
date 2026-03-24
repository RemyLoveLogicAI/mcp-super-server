/**
 * Protocol resources barrel export.
 * Whitepaper §4.2: Core Components
 * 
 * Resources are protocol-addressable state objects.
 * MCP Resources (Whitepaper §12):
 *   /voice/sessions/{id}
 *   /identity/users/{id}
 *   /worlds/{world_id}/timelines/{timeline_id}
 *   /tools/{tool_id}
 */

export * from "./voiceSession.js";
export * from "./worldState.js";
export * from "./identity.js";
export * from "./tool.js";
