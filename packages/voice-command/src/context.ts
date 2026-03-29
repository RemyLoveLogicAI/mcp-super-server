/**
 * @mss/voice-command - Context Awareness
 * Voice session context with project state and conversation history
 */

import {
  VoiceCommandContextSchema,
  ConversationTurnSchema,
  ProjectContextSchema,
  type VoiceCommandContext,
  type ConversationTurn,
  type ProjectContext,
} from "./types";

// ============================================================================
// Entity Resolver
// ============================================================================

export interface ResolvedEntity {
  type: "project" | "file" | "service" | "script" | "unknown";
  value: string;
  normalized: string;
  confidence: number;
}

export class EntityResolver {
  private knownProjects: Map<string, string[]> = new Map();
  private knownFiles: Map<string, string[]> = new Map();
  private knownServices: Map<string, string[]> = new Map();

  /**
   * Register known entities
   */
  registerProject(name: string, aliases: string[] = []): void {
    const normalized = name.toLowerCase();
    this.knownProjects.set(normalized, [name, ...aliases]);
  }

  registerFile(path: string, aliases: string[] = []): void {
    const normalized = path.toLowerCase();
    this.knownFiles.set(normalized, [path, ...aliases]);
  }

  registerService(name: string, aliases: string[] = []): void {
    const normalized = name.toLowerCase();
    this.knownServices.set(normalized, [name, ...aliases]);
  }

  /**
   * Resolve an entity from user input
   */
  resolve(input: string): ResolvedEntity {
    const normalized = input.toLowerCase().trim();

    // Check projects
    for (const [key, aliases] of this.knownProjects) {
      if (key.includes(normalized) || normalized.includes(key) ||
          aliases.some(a => a.toLowerCase() === normalized)) {
        return {
          type: "project" as const,
          value: aliases[0] ?? key,
          normalized: key,
          confidence: 0.9,
        };
      }
    }

    // Check files
    for (const [key, aliases] of this.knownFiles) {
      if (key.includes(normalized) || normalized.includes(key) ||
          aliases.some(a => a.toLowerCase() === normalized)) {
        return {
          type: "file" as const,
          value: aliases[0] ?? key,
          normalized: key,
          confidence: 0.9,
        };
      }
    }

    // Check services
    for (const [key, aliases] of this.knownServices) {
      if (key.includes(normalized) || normalized.includes(key) ||
          aliases.some(a => a.toLowerCase() === normalized)) {
        return {
          type: "service" as const,
          value: aliases[0] ?? key,
          normalized: key,
          confidence: 0.9,
        };
      }
    }

    // Fuzzy match
    return {
      type: "unknown" as const,
      value: input,
      normalized,
      confidence: 0.3,
    };
  }
}

// ============================================================================
// Conversation History
// ============================================================================

export class ConversationHistory {
  private turns: ConversationTurn[] = [];
  private maxTurns: number;

  constructor(maxTurns: number = 50) {
    this.maxTurns = maxTurns;
  }

  /**
   * Add a turn to history
   */
  addTurn(turn: ConversationTurn): void {
    this.turns.push(turn);
    if (this.turns.length > this.maxTurns) {
      this.turns.shift();
    }
  }

  /**
   * Get recent turns
   */
  getRecent(count: number = 10): ConversationTurn[] {
    return this.turns.slice(-count);
  }

  /**
   * Get all turns
   */
  getAll(): ConversationTurn[] {
    return [...this.turns];
  }

  /**
   * Get turns by action type
   */
  getByAction(action: string): ConversationTurn[] {
    return this.turns.filter(
      (t) => t.intent?.action === action
    );
  }

  /**
   * Get last intent for a target
   */
  getLastForTarget(target: string): ConversationTurn | undefined {
    const normalized = target.toLowerCase();
    for (let i = this.turns.length - 1; i >= 0; i--) {
      const turn = this.turns[i];
      if (turn && turn.intent?.target?.toLowerCase() === normalized) {
        return turn;
      }
    }
    return undefined;
  }

  /**
   * Clear history
   */
  clear(): void {
    this.turns = [];
  }
}

// ============================================================================
// Voice Command Context Manager
// ============================================================================

export class VoiceCommandContextManager {
  private context: VoiceCommandContext;
  private entityResolver: EntityResolver;
  private conversationHistory: ConversationHistory;

  constructor(
    sessionId: string,
    userId: string,
    channel: string
  ) {
    this.context = {
      session_id: sessionId,
      user_id: userId,
      channel,
      working_directory: process.cwd(),
      conversation_history: [],
    };
    this.entityResolver = new EntityResolver();
    this.conversationHistory = new ConversationHistory();
  }

  /**
   * Set working directory
   */
  setWorkingDirectory(path: string): void {
    this.context.working_directory = path;
  }

  /**
   * Set project context
   */
  setProject(project: ProjectContext): void {
    this.context.project = project;
    if (project.project_name) {
      this.entityResolver.registerProject(project.project_name);
    }
    if (project.current_files) {
      for (const file of project.current_files) {
        this.entityResolver.registerFile(file);
      }
    }
  }

  /**
   * Update project context
   */
  updateProject(updates: Partial<ProjectContext>): void {
    if (this.context.project) {
      this.context.project = { ...this.context.project, ...updates };
    } else {
      this.context.project = updates;
    }
  }

  /**
   * Set FSM state
   */
  setFsmState(state: string): void {
    this.context.fsm_state = state;
  }

  /**
   * Get current context
   */
  getContext(): Readonly<VoiceCommandContext> {
    return { ...this.context };
  }

  /**
   * Get entity resolver
   */
  getEntityResolver(): EntityResolver {
    return this.entityResolver;
  }

  /**
   * Get conversation history
   */
  getConversationHistory(): ConversationHistory {
    return this.conversationHistory;
  }

  /**
   * Resolve an entity
   */
  resolveEntity(input: string): ResolvedEntity {
    return this.entityResolver.resolve(input);
  }

  /**
   * Add a conversation turn
   */
  addConversationTurn(
    transcript: string,
    intent?: ConversationTurn["intent"],
    executionResults?: ConversationTurn["execution_results"]
  ): void {
    const turn: ConversationTurn = {
      turn_id: this.conversationHistory.getAll().length + 1,
      transcript,
      intent,
      execution_results: executionResults,
      timestamp: new Date().toISOString(),
    };
    this.conversationHistory.addTurn(turn);
    this.context.conversation_history = this.conversationHistory.getAll();
  }

  /**
   * Check if context is valid for command
   */
  canExecuteCommand(action: string): { valid: boolean; reason?: string } {
    // Check FSM state
    if (this.context.fsm_state === "speaking") {
      return { valid: false, reason: "System is currently speaking" };
    }
    if (this.context.fsm_state === "interrupted") {
      return { valid: false, reason: "Session was interrupted" };
    }

    // Check for required project context
    const highRiskActions = ["deploy", "delete", "stop", "restart"];
    if (highRiskActions.includes(action)) {
      if (!this.context.project?.project_name) {
        return { valid: false, reason: "No project context available" };
      }
    }

    return { valid: true };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createVoiceCommandContext(
  sessionId: string,
  userId: string,
  channel: string
): VoiceCommandContextManager {
  return new VoiceCommandContextManager(sessionId, userId, channel);
}
