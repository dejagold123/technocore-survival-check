-- Technocore Survival Check — longitudinal field-study tables.
-- Unowned public rows (auth off). No personal data.

create table if not exists tracked_receipts (
  id                    serial primary key,
  label                 text not null,
  room                  text not null,
  seq                   bigint not null,
  nonce                 text,
  posted_at             timestamptz,
  text_preview          text,
  did                   text not null,
  source                text not null,
  has_client_receipt    boolean not null default false,
  last_status           text not null default 'recorded',
  last_visible_at       timestamptz,
  first_missing_at      timestamptz,
  last_sequences_ahead  bigint,
  last_checked_at       timestamptz,
  unique (room, seq)
);

create table if not exists observations (
  id                      serial primary key,
  observed_at             timestamptz not null default now(),
  room                    text not null,
  current_seq             bigint,
  previous_seq            bigint,
  sequence_growth         bigint,
  interval_seconds        double precision,
  velocity_per_minute     double precision,
  window_velocity_per_min double precision,
  window_first_seq        bigint,
  window_last_seq         bigint,
  window_count            integer,
  window_span             integer,
  window_seconds          double precision,
  did_note_reachable      boolean,
  did_note_contains_did   boolean,
  did_note_http           integer,
  anomaly                 text,
  conclusion              text,
  probe_ok                boolean not null default true,
  error_message           text,
  source                  text not null default 'agent',
  cycle_key               text
);

create index if not exists observations_observed_at_idx on observations (observed_at desc);
create index if not exists observations_room_idx on observations (room, observed_at desc);

create table if not exists receipt_checks (
  id                serial primary key,
  observation_id    integer not null references observations(id) on delete cascade,
  receipt_id        integer not null references tracked_receipts(id) on delete cascade,
  room              text not null,
  seq               bigint not null,
  in_live_window    boolean not null,
  missed_by_ring    boolean not null,
  sequences_ahead   bigint,
  window_first_seq  bigint,
  window_last_seq   bigint,
  window_span       integer,
  visibility_status text not null,
  matches_did       boolean,
  survival_seconds  double precision
);

create index if not exists receipt_checks_obs_idx on receipt_checks (observation_id);
create index if not exists receipt_checks_receipt_idx on receipt_checks (receipt_id, observation_id desc);
