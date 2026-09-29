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
  id: string;
  eventType: string;
  entityId?: string;
  payload: Record<string, unknown>;
  timestamp: string;
  actorId?: string;
}

export interface WorldSnapshot {
  worldId: string;
  entities: Entity[];
  eventCount: number;
  events: WorldEvent[];
  customState: Record<string, unknown>;
}

export class WorldState {
  private entities: Map<string, Entity> = new Map();
  private eventLog: WorldEvent[] = [];
  private seenEventIds: Set<string> = new Set();
  private customState: Record<string, unknown> = {};
  readonly worldId: string;
  readonly config: WorldConfig;
  
  constructor(worldId: string, config: WorldConfig) {
    this.worldId = worldId;
    this.config = config;
  }
  
  applyEvent(event: WorldEvent | (Omit<WorldEvent, "id"> & { id?: string })): void {
    const fullEvent: WorldEvent = {
      ...event,
      id: event.id ?? crypto.randomUUID()
    };
    if (this.seenEventIds.has(fullEvent.id)) {
      throw new Error(`Duplicate event ID: ${fullEvent.id}`);
    }
    this.seenEventIds.add(fullEvent.id);
    this.eventLog.push(structuredClone(fullEvent));
    this._apply(fullEvent);
  }

  private _applyToState(
    event: WorldEvent,
    targetEntities: Map<string, Entity>,
    targetCustomState: Record<string, unknown>
  ): Record<string, unknown> {
    switch (event.eventType) {
      case "entity_created": {
        const entityId =
          event.entityId ??
          (typeof event.payload["id"] === "string" ? event.payload["id"] : crypto.randomUUID());
        const type = typeof event.payload["type"] === "string" ? event.payload["type"] : "default";
        const rawState = event.payload["state"];
        const state =
          rawState && typeof rawState === "object" && !Array.isArray(rawState)
            ? { ...(rawState as Record<string, unknown>) }
            : {};

        let position: { x: number; y: number; z?: number } | undefined;
        const rawPos = event.payload["position"];
        if (rawPos && typeof rawPos === "object" && "x" in rawPos && "y" in rawPos) {
          const p = rawPos as { x: unknown; y: unknown; z?: unknown };
          if (typeof p.x === "number" && typeof p.y === "number") {
            position = {
              x: p.x,
              y: p.y,
              ...(typeof p.z === "number" ? { z: p.z } : {})
            };
          }
        }

        const createdAt = event.timestamp || new Date().toISOString();
        const updatedAt = createdAt;

        const entity: Entity = {
          id: entityId,
          type,
          state,
          ...(position !== undefined ? { position } : {}),
          createdAt,
          updatedAt
        };

        targetEntities.set(entityId, entity);
        return targetCustomState;
      }

      case "entity_updated": {
        const entityId =
          event.entityId ??
          (typeof event.payload["entityId"] === "string" ? event.payload["entityId"] : undefined);
        if (!entityId) return targetCustomState;
        const entity = targetEntities.get(entityId);
        if (!entity) return targetCustomState;

        let stateUpdates: Record<string, unknown> = {};
        let positionUpdates: { x: number; y: number; z?: number } | undefined;

        const rawUpdates = event.payload["updates"];
        if (rawUpdates && typeof rawUpdates === "object" && !Array.isArray(rawUpdates)) {
          const u = rawUpdates as Record<string, unknown>;
          if ("state" in u && u["state"] && typeof u["state"] === "object" && !Array.isArray(u["state"])) {
            stateUpdates = { ...(u["state"] as Record<string, unknown>) };
          } else {
            stateUpdates = { ...u };
          }
          if ("position" in u && u["position"] && typeof u["position"] === "object") {
            const p = u["position"] as { x: unknown; y: unknown; z?: unknown };
            if (typeof p.x === "number" && typeof p.y === "number") {
              positionUpdates = {
                x: p.x,
                y: p.y,
                ...(typeof p.z === "number" ? { z: p.z } : {})
              };
            }
          }
        }

        if (
          "state" in event.payload &&
          event.payload["state"] &&
          typeof event.payload["state"] === "object" &&
          !Array.isArray(event.payload["state"])
        ) {
          stateUpdates = { ...stateUpdates, ...(event.payload["state"] as Record<string, unknown>) };
        }
        if ("position" in event.payload && event.payload["position"] && typeof event.payload["position"] === "object") {
          const p = event.payload["position"] as { x: unknown; y: unknown; z?: unknown };
          if (typeof p.x === "number" && typeof p.y === "number") {
            positionUpdates = {
              x: p.x,
              y: p.y,
              ...(typeof p.z === "number" ? { z: p.z } : {})
            };
          }
        }

        const mergedState = { ...entity.state, ...stateUpdates };
        const mergedPosition = positionUpdates !== undefined ? positionUpdates : entity.position;

        const updated: Entity = {
          ...entity,
          state: mergedState,
          ...(mergedPosition !== undefined ? { position: mergedPosition } : {}),
          updatedAt: event.timestamp || new Date().toISOString()
        };

        targetEntities.set(entityId, updated);
        return targetCustomState;
      }

      case "entity_deleted": {
        const entityId =
          event.entityId ??
          (typeof event.payload["entityId"] === "string" ? event.payload["entityId"] : undefined);
        if (entityId) {
          targetEntities.delete(entityId);
        }
        return targetCustomState;
      }

      default: {
        const entityId =
          event.entityId ??
          (typeof event.payload["entityId"] === "string" ? event.payload["entityId"] : undefined);
        if (entityId) {
          const entity = targetEntities.get(entityId);
          if (entity) {
            const stateUpdate =
              event.payload["state"] &&
              typeof event.payload["state"] === "object" &&
              !Array.isArray(event.payload["state"])
                ? (event.payload["state"] as Record<string, unknown>)
                : event.payload;
            entity.state = { ...entity.state, ...stateUpdate };
            entity.updatedAt = event.timestamp || new Date().toISOString();
          }
          return targetCustomState;
        } else {
          return {
            ...targetCustomState,
            [event.eventType]: event.payload,
            ...event.payload
          };
        }
      }
    }
  }

  private _apply(event: WorldEvent): void {
    this.customState = this._applyToState(event, this.entities, this.customState);
  }
  
  createEntity(type: string, initialState: Record<string, unknown> = {}): Entity {
    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();
    const rawPosition = initialState["position"];
    const event: WorldEvent = {
      id: crypto.randomUUID(),
      eventType: "entity_created",
      entityId: id,
      payload: {
        type,
        state: { ...initialState },
        ...(rawPosition !== undefined ? { position: rawPosition } : {})
      },
      timestamp
    };
    
    this.applyEvent(event);
    
    const entity = this.entities.get(id);
    if (!entity) {
      throw new Error(`Failed to create entity ${id}`);
    }
    return structuredClone(entity);
  }
  
  getEntity(id: string): Entity | undefined {
    const entity = this.entities.get(id);
    return entity ? structuredClone(entity) : undefined;
  }
  
  updateEntity(id: string, updates: Partial<Entity> | Record<string, unknown>): Entity | undefined {
    const entity = this.entities.get(id);
    if (!entity) return undefined;

    const stateUpdates = ("state" in updates ? (updates as Partial<Entity>).state : updates) ?? {};
    const positionUpdates = "position" in updates ? (updates as Partial<Entity>).position : undefined;

    const payload: Record<string, unknown> = {
      updates: stateUpdates,
      ...(positionUpdates !== undefined ? { position: positionUpdates } : {})
    };

    const event: WorldEvent = {
      id: crypto.randomUUID(),
      eventType: "entity_updated",
      entityId: id,
      payload,
      timestamp: new Date().toISOString()
    };

    this.applyEvent(event);

    const updated = this.entities.get(id);
    return updated ? structuredClone(updated) : undefined;
  }
  
  deleteEntity(id: string): boolean {
    if (!this.entities.has(id)) return false;

    const event: WorldEvent = {
      id: crypto.randomUUID(),
      eventType: "entity_deleted",
      entityId: id,
      payload: {},
      timestamp: new Date().toISOString()
    };

    this.applyEvent(event);

    return true;
  }
  
  listEntities(type?: string): Entity[] {
    const entities = Array.from(this.entities.values());
    const filtered = type ? entities.filter(e => e.type === type) : entities;
    return filtered.map(e => structuredClone(e));
  }
  
  logEvent(eventType: string, entityId?: string, payload: Record<string, unknown> = {}): void {
    const event: WorldEvent = {
      id: crypto.randomUUID(),
      eventType,
      ...(entityId !== undefined ? { entityId } : {}),
      payload,
      timestamp: new Date().toISOString()
    };
    this.applyEvent(event);
  }
  
  replayEvents(): WorldEvent[] {
    return this.eventLog.map(e => structuredClone(e));
  }

  restore(snapshot: WorldSnapshot): void {
    if (snapshot.worldId !== this.worldId) {
      throw new Error(`Cannot restore snapshot for world ${snapshot.worldId} into world ${this.worldId}`);
    }
    if (snapshot.events.length !== snapshot.eventCount) {
      throw new Error(`Snapshot eventCount mismatch: expected ${snapshot.eventCount}, got ${snapshot.events.length}`);
    }
    this.rehydrate(snapshot.events);
  }

  rehydrate(events: WorldEvent[]): void {
    const tempEntities = new Map<string, Entity>();
    let tempCustomState: Record<string, unknown> = {};
    const tempSeenIds = new Set<string>();
    const tempLog: WorldEvent[] = [];

    for (const event of events) {
      if (tempSeenIds.has(event.id)) {
        throw new Error(`Duplicate event ID in event history: ${event.id}`);
      }
      tempSeenIds.add(event.id);
      const cloned = structuredClone(event);
      tempLog.push(cloned);
      tempCustomState = this._applyToState(cloned, tempEntities, tempCustomState);
    }

    // Atomic commit - only reached if all events succeed
    this.entities = tempEntities;
    this.customState = tempCustomState;
    this.eventLog = tempLog;
    this.seenEventIds = tempSeenIds;
  }

  getCustomState(): Record<string, unknown> {
    return structuredClone(this.customState);
  }
  
  snapshot(): WorldSnapshot {
    return {
      worldId: this.worldId,
      entities: this.listEntities(),
      eventCount: this.eventLog.length,
      events: this.replayEvents(),
      customState: this.getCustomState()
    };
  }
}
