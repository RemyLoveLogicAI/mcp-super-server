import { createInMemoryLedger } from './packages/ledger/dist/memory.js';
import { createVoiceTurnStarted, createToolCallRequested, createWorldEventAppended } from './packages/core/dist/testing.js';
import { generateWorldId, generateTimelineId } from './packages/core/dist/ids.js';

const ledger = createInMemoryLedger();
const worldId = generateWorldId();
const timelineId = generateTimelineId();
ledger.registerTimeline(timelineId, worldId);

const e1 = createVoiceTurnStarted();
const e2 = createToolCallRequested();
const e3 = createWorldEventAppended({ world_id: worldId, timeline_id: timelineId });

const r1 = await ledger.append(e1, worldId, timelineId);
console.log('After append e1 - stored hash:', r1.hash, 'stored prevHash:', r1.prev_hash);

const r2 = await ledger.append(e2, worldId, timelineId);
console.log('After append e2 - stored hash:', r2.hash, 'stored prevHash:', r2.prev_hash);

const r3 = await ledger.append(e3, worldId, timelineId);

const result = await ledger.verifyIntegrity(worldId, timelineId);
console.log('\nIntegrity result:', result);
