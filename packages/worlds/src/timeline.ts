/**
 * @mss/worlds - Timeline Branching
 * Whitepaper §4.2.8: Event Ledger
 */

import type { WorldEvent } from "./world.js";

export interface Timeline {
  id: string;
  worldId: string;
  name: string;
  forkFromTimelineId?: string;
  forkPoint: number;
  events: WorldEvent[];
  isHead: boolean;
}

export class TimelineManager {
  private timelines: Map<string, Timeline> = new Map();
  private heads: Map<string, string> = new Map(); // worldId -> timelineId
  
  createTimeline(worldId: string, name: string, forkFromTimelineId?: string, forkPoint?: number): Timeline {
    const id = crypto.randomUUID();
    
    let events: WorldEvent[] = [];
    let forkPointEventCount = 0;
    
    if (forkFromTimelineId !== undefined) {
      const parent = this.timelines.get(forkFromTimelineId);
      if (!parent) {
        throw new Error(`Parent timeline ${forkFromTimelineId} not found`);
      }
      if (parent.worldId !== worldId) {
        throw new Error(`Parent timeline belongs to world ${parent.worldId}, not ${worldId}`);
      }
      if (forkPoint !== undefined) {
        if (forkPoint < 0 || forkPoint > parent.events.length) {
          throw new Error(`forkPoint ${forkPoint} out of bounds [0, ${parent.events.length}]`);
        }
        forkPointEventCount = forkPoint;
      } else {
        forkPointEventCount = parent.events.length;
      }
      events = parent.events.slice(0, forkPointEventCount);
    }
    
    const timeline: Timeline = {
      id,
      worldId,
      name,
      ...(forkFromTimelineId !== undefined ? { forkFromTimelineId } : {}),
      forkPoint: forkPointEventCount,
      events,
      isHead: true
    };
    
    // Mark previous head as not head
    const currentHead = this.heads.get(worldId);
    if (currentHead) {
      const current = this.timelines.get(currentHead);
      if (current) current.isHead = false;
    }
    
    this.timelines.set(id, timeline);
    this.heads.set(worldId, id);
    
    return timeline;
  }
  
  appendEvent(worldId: string, event: WorldEvent | (Omit<WorldEvent, "id" | "timestamp"> & { id?: string; timestamp?: string })): void {
    const headTimelineId = this.heads.get(worldId);
    if (!headTimelineId) throw new Error(`No timeline for world ${worldId}`);
    
    const timeline = this.timelines.get(headTimelineId);
    if (!timeline) throw new Error(`Timeline ${headTimelineId} not found`);
    
    const fullEvent: WorldEvent = {
      id: event.id ?? crypto.randomUUID(),
      eventType: event.eventType,
      payload: event.payload,
      timestamp: event.timestamp ?? new Date().toISOString(),
      ...(event.entityId !== undefined ? { entityId: event.entityId } : {}),
      ...(event.actorId !== undefined ? { actorId: event.actorId } : {})
    };

    if (timeline.events.some(e => e.id === fullEvent.id)) {
      throw new Error(`Duplicate event ID: ${fullEvent.id} in timeline ${timeline.id}`);
    }

    timeline.events.push(fullEvent);
  }
  
  forkTimeline(timelineId: string, name: string, atEventIndex: number): Timeline {
    const original = this.timelines.get(timelineId);
    if (!original) throw new Error(`Timeline ${timelineId} not found`);
    
    if (atEventIndex < 0 || atEventIndex > original.events.length) {
      throw new Error(
        `atEventIndex ${atEventIndex} out of bounds [0, ${original.events.length}]`
      );
    }
    
    return this.createTimeline(original.worldId, name, timelineId, atEventIndex);
  }
  
  getTimeline(id: string): Timeline | undefined {
    return this.timelines.get(id);
  }
  
  getHead(worldId: string): Timeline | undefined {
    const headId = this.heads.get(worldId);
    return headId ? this.timelines.get(headId) : undefined;
  }
  
  listTimelines(worldId?: string): Timeline[] {
    const all = Array.from(this.timelines.values());
    if (worldId) {
      return all.filter(t => t.worldId === worldId);
    }
    return all;
  }
  
  mergeTimeline(sourceId: string, targetId: string): Timeline | undefined {
    if (sourceId === targetId) {
      throw new Error(`Cannot merge timeline into itself: ${sourceId}`);
    }

    const source = this.timelines.get(sourceId);
    const target = this.timelines.get(targetId);
    if (!source || !target) return undefined;
    
    if (source.worldId !== target.worldId) {
      throw new Error("Cannot merge timelines across different worlds");
    }

    // Collect ancestor IDs for target (including target.id itself)
    const targetAncestors = new Set<string>();
    let currTarget: Timeline | undefined = target;
    while (currTarget) {
      targetAncestors.add(currTarget.id);
      currTarget = currTarget.forkFromTimelineId
        ? this.timelines.get(currTarget.forkFromTimelineId)
        : undefined;
    }

    // Walk up from source (including source.id itself) to find Lowest Common Ancestor
    let lcaId: string | undefined;
    let currSource: Timeline | undefined = source;
    while (currSource) {
      if (targetAncestors.has(currSource.id)) {
        lcaId = currSource.id;
        break;
      }
      currSource = currSource.forkFromTimelineId
        ? this.timelines.get(currSource.forkFromTimelineId)
        : undefined;
    }

    if (!lcaId) {
      throw new Error(`Cannot merge timelines with no common ancestry: ${sourceId} and ${targetId}`);
    }

    const targetIds = new Set(target.events.map(e => e.id));
    let divergentEvents: WorldEvent[] = [];

    if (lcaId === source.id) {
      // source is an ancestor of target: source is already in target's history
      divergentEvents = [];
    } else if (lcaId === target.id) {
      // target is an ancestor of source: append events occurring after branch point from target
      let walker: Timeline = source;
      while (walker.forkFromTimelineId && walker.forkFromTimelineId !== target.id) {
        const parent = this.timelines.get(walker.forkFromTimelineId);
        if (!parent) break;
        walker = parent;
      }
      const branchPointFromTarget = walker.forkPoint;
      const candidates = source.events.slice(branchPointFromTarget);
      divergentEvents = candidates.filter(cand => !targetIds.has(cand.id));
    } else {
      // source and target are siblings of common ancestor P (lcaId)
      let walkerS: Timeline = source;
      while (walkerS.forkFromTimelineId && walkerS.forkFromTimelineId !== lcaId) {
        const parent = this.timelines.get(walkerS.forkFromTimelineId);
        if (!parent) break;
        walkerS = parent;
      }
      const sourceBranchPoint = walkerS.forkPoint;

      let walkerT: Timeline = target;
      while (walkerT.forkFromTimelineId && walkerT.forkFromTimelineId !== lcaId) {
        const parent = this.timelines.get(walkerT.forkFromTimelineId);
        if (!parent) break;
        walkerT = parent;
      }
      const targetBranchPoint = walkerT.forkPoint;

      const commonBase = Math.min(sourceBranchPoint, targetBranchPoint);
      const candidates = source.events.slice(commonBase);
      divergentEvents = candidates.filter(cand => !targetIds.has(cand.id));
    }

    for (const event of divergentEvents) {
      target.events.push(event);
    }
    
    const currentHeadId = this.heads.get(source.worldId);
    if (currentHeadId && currentHeadId !== target.id) {
      const cur = this.timelines.get(currentHeadId);
      if (cur) cur.isHead = false;
    }
    source.isHead = false;
    target.isHead = true;
    this.heads.set(source.worldId, target.id);
    
    return target;
  }
}
