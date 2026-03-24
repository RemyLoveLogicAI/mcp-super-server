/**
 * @mss/worlds - World State Management
 * Whitepaper §4.2.6 + Patent Surface #3
 */

export type WorldType = "game" | "simulation" | "narrative" | "custom";

export interface WorldConfig {
  worldType: WorldType;
  maxEntities?: number;
  persistenceEnabled?: boolean;
}

export interface Entity {
  id: string;
  type: string;
  state: Record<string, unknown>;
  position?: { x: number; y: number; z?: number };
  createdAt: string;
  updatedAt: string;
}

export interface WorldEvent {
  eventType: string;
  entityId?: string;
  payload: Record<string, unknown>;
  timestamp: string;
  actorId?: string;
}

export class WorldState {
  private entities: Map<string, Entity> = new Map();
  private eventLog: WorldEvent[] = [];
  readonly worldId: string;
  readonly config: WorldConfig;
  
  constructor(worldId: string, config: WorldConfig) {
    this.worldId = worldId;
    this.config = config;
  }
  
  createEntity(type: string, initialState: Record<string, unknown> = {}): Entity {
    const entity: Entity = {
      id: crypto.randomUUID(),
      type,
      state: { ...initialState },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    this.entities.set(entity.id, entity);
    this.logEvent("entity_created", entity.id, { type, state: { ...initialState } });
    
    return entity;
  }
  
  getEntity(id: string): Entity | undefined {
    return this.entities.get(id);
  }
  
  updateEntity(id: string, updates: Partial<Entity> | Record<string, unknown>): Entity | undefined {
    const entity = this.entities.get(id);
    if (!entity) return undefined;

    const stateUpdates = ("state" in updates ? (updates as Partial<Entity>).state : updates) ?? {};
    const mergedState = { ...entity.state, ...stateUpdates };
    const mergedPosition = "position" in updates ? (updates as Partial<Entity>).position ?? entity.position : entity.position;
    
    const updated: Entity = {
      ...entity,
      state: mergedState,
      ...(mergedPosition ? { position: mergedPosition } : {}),
      updatedAt: new Date().toISOString()
    };
    
    this.entities.set(id, updated);
    this.logEvent("entity_updated", id, { updates: stateUpdates });
    
    return updated;
  }
  
  deleteEntity(id: string): boolean {
    const deleted = this.entities.delete(id);
    if (deleted) this.logEvent("entity_deleted", id);
    return deleted;
  }
  
  listEntities(type?: string): Entity[] {
    const entities = Array.from(this.entities.values());
    return type ? entities.filter(e => e.type === type) : entities;
  }
  
  logEvent(eventType: string, entityId?: string, payload: Record<string, unknown> = {}): void {
    this.eventLog.push({
      eventType,
      ...(entityId ? { entityId } : {}),
      payload,
      timestamp: new Date().toISOString()
    });
  }
  
  replayEvents(): WorldEvent[] {
    return [...this.eventLog];
  }
  
  snapshot(): { worldId: string; entities: Entity[]; eventCount: number } {
    return { worldId: this.worldId, entities: this.listEntities(), eventCount: this.eventLog.length };
  }
}
