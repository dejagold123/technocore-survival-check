-- Active agent: events, room snapshots (turnover), posting audit, durable state.
-- Unowned public rows. No secrets.

create table if not exists room_snapshots (
  id                   serial primary key,
  observation_id       integer references observations(id) on delete cascade,
  observed_at          timestamptz not null,
  room                 text not null,
  first_seq            bigint,
  last_seq             bigint,
  window_count         integer,
  window_span          integer,
  window_bytes         integer,
  velocity_per_minute  double precision,
  probe_ok             boolean not null default true,
  http_error           text
);
create index if not exists room_snapshots_room_at_idx on room_snapshots (room, observed_at desc);

create table if not exists agent_events (
  id               serial primary key,
  created_at       timestamptz not null default now(),
  event_type       text not null,
  room             text not null,
  subject          text not null,
  dedupe_key       text not null unique,
  title            text not null,
  pointer_text     text not null,
  detail           text,
  observation_id   integer references observations(id) on delete set null,
  posted           boolean not null default false,
  posted_seq       bigint,
  posted_at        timestamptz,
  skip_reason      text
);
create index if not exists agent_events_created_idx on agent_events (created_at desc);
create index if not exists agent_events_type_idx on agent_events (event_type, created_at desc);

create table if not exists agent_posts (
  id                serial primary key,
  created_at        timestamptz not null default now(),
  event_id          integer references agent_events(id) on delete set null,
  room              text not null,
  text              text not null,
  http_status       integer,
  response_preview  text,
  seq               bigint
);
create index if not exists agent_posts_created_idx on agent_posts (created_at desc);

create table if not exists agent_state (
  key         text primary key,
  value       text,
  updated_at  timestamptz not null default now()
);
