-- MCP Super-Server: Supabase Ledger Tables
-- Whitepaper §4.2.8: Event Ledger
-- Run this in your Supabase SQL editor

create extension if not exists "uuid-ossp";

create table if not exists timelines (
  id uuid primary key default uuid_generate_v4(),
  world_id uuid not null,
  name text,
  forked_from_timeline_id uuid references timelines(id),
  fork_point_event_index bigint,
  head_event_index bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key,
  event_type text not null,
  timestamp timestamptz not null,
  actor_canonical_user_id uuid,
  actor_agent_id text,
  actor_platform text,
  actor_system boolean not null default false,
  world_id uuid,
  timeline_id uuid references timelines(id),
  event_index bigint not null,
  prev_hash text,
  hash text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists events_timeline_index_unique on events(timeline_id, event_index);
create index if not exists events_world_id_idx on events(world_id);
create index if not exists events_timeline_id_idx on events(timeline_id);
create index if not exists events_event_type_idx on events(event_type);
create index if not exists events_timestamp_idx on events(timestamp);
create index if not exists events_actor_idx on events(actor_canonical_user_id);
create index if not exists timelines_world_id_idx on timelines(world_id);

create or replace function update_timeline_head()
returns trigger as $$
begin
  if new.timeline_id is not null then
    update timelines
      set head_event_index = new.event_index,
          updated_at = now()
      where id = new.timeline_id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists events_update_timeline_head on events;
create trigger events_update_timeline_head
  after insert on events
  for each row execute function update_timeline_head();

alter table events enable row level security;
alter table timelines enable row level security;

create policy "service role can do anything to events"
  on events for all to service_role
  using (true) with check (true);

create policy "service role can do anything to timelines"
  on timelines for all to service_role
  using (true) with check (true);

comment on table events is 'Append-only event store for MCP Super-Server';
comment on table timelines is 'Timeline branches for event replay and forking';
