# Phase 4 — Supabase/Postgres Persistence

## Scope
- Supabase-backed append-only event ledger
- SQL migrations
- Replay integrity verification
- Backup/restore expectations

## Success Criteria
- Ledger survives restart
- Replay returns the same event chain
- Forked timelines are queryable

## Operational Notes
- Configure `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in Zo secrets
- Run `packages/ledger/migrations/001_create_tables.sql` in Supabase SQL editor
- Prefer service role for writes
