# Command Layer v1

## What this is

A system that converts signals (GitHub, Gmail, Drive) into a single execution-focused output.

## Problem

Current tools create noise, not decisions.

Founders operate across multiple systems (GitHub for code, Gmail for comms, Drive for docs) with no unified signal layer. Each tool generates its own notifications, its own urgency signals, its own interface. The result: fragmentation, not focus.

**The gap**: No single source of truth for "what matters most right now."

## Solution

**Aggregate signals → prioritize → output actionable brief.**

The Command Layer:
1. **Ingests** signals from connected sources (GitHub activity, Gmail priority, Drive changes)
2. **Detects** urgency patterns (paused automations, failed CI, urgent keywords)
3. **Outputs** a prioritized brief: "Do X first, then Y, ignore Z"

This is not a dashboard. It's a decision engine. One output. One focus point.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   GitHub    │     │    Gmail    │     │   Drive     │
│  (PRs, CI)  │     │  (Priority) │     │   (Docs)    │└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
              │            │                     │
              ▼            ▼                     ▼
         ┌─────────────────────────────────────────────┐
         │              SIGNAL AGGREGATOR              │
         │   Normalize → Pattern Match → Prioritize   │
         └─────────────────────────────────────────────┘
                              │
                              ▼
         ┌─────────────────────────────────────────────┐
         │              PRIORITY BRIEF                 │
         │   "HIGH: Fix X | MEDIUM: Review Y | ..."   │
         └─────────────────────────────────────────────┘
```

## Current State

- **Local scripts working**: `command_loop.py` processes signals and outputs priorities
- **GitHub activity active**: MCP Super-Server packages shipped (approval-gate, vigil, voice-command)
- **Integrations partially connected**: Gmail via Oceum, GitHub via gh CLI
- **Zo Space dashboard**: Live at remysr.zo.space

## Packages Shipped

### MCP Super-Server Components

1. **approval-gate**: Human-in-the-loop approval queue with notification routing
2. **vigil**: Self-healing monitoring with diagnosis/escalation/verification
3. **voice-command**: Intent detection and command routing for voice sessions

## Next Step

1. Connect real data sources (Gmail API, GitHub API, Drive API)
2. Automate signal polling on schedule (cron or agent-based)
3. Output daily priority brief to Telegram/SMS

## File Structure

```
founder-command-center/
├── command_loop.py      # Signal processing script
├── command_output.txt   # Generated output (proof of execution)
├── COMMAND_LAYER_V1.md  # This document
└── signals/             # Signal definitions (future)
```

## Success Criteria

- [x] Local script executes and outputs priorities
- [x] Logic exists for email/github/drive signal detection
- [ ] Real data sources connected
- [ ] Automated daily brief generation
- [ ] Brief delivered to notification channel (Telegram/SMS)

---

**Status**: Operational seed. Ready for real data connection.
**Last Updated**: 2026-03-29