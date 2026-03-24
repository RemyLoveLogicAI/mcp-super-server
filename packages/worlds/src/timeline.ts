/**
 * @mss/worlds - Timeline Branching
 * Whitepaper §4.2.8: Event Ledger
 */

import { WorldState, type WorldEvent } from "./world.js";

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
    
    if (forkFromTimelineId) {
      const parent = this.timelines.get(forkFromTimelineId);
      if (parent) {
        events = parent.events.slice(0, forkPoint ?? parent.forkPoint);
        forkPointEventCount = forkPoint ?? parent.forkPoint;
      }
    }
    
    const timeline: Timeline = {
      id,
      worldId,
      name,
      ...(forkFromTimelineId ? { forkFromTimelineId } : {}),
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
  
  appendEvent(worldId: string, event: WorldEvent): void {
    const headTimelineId = this.heads.get(worldId);
    if (!headTimelineId) throw new Error(`No timeline for world ${worldId}`);
    
    const timeline = this.timelines.get(headTimelineId);
    if (!timeline) throw new Error(`Timeline ${headTimelineId} not found`);
    
    timeline.events.push(event);
  }
  
  forkTimeline(timelineId: string, name: string, atEventIndex: number): Timeline {
    const original = this.timelines.get(timelineId);
    if (!original) throw new Error(`Timeline ${timelineId} not found`);
    
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
    const source = this.timelines.get(sourceId);
    const target = this.timelines.get(targetId);
    if (!source || !target) return undefined;
    
    // Append source events to target
    for (const event of source.events.slice(target.events.length)) {
      target.events.push(event);
    }
    
    // Mark source as not head
    source.isHead = false;
    
    return target;
  }
}
