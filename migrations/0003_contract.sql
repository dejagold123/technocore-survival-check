-- Advertised protocol contract vs observed ring, plus death-mode taxonomy.
-- Additive; do not edit 0002.

alter table observations add column if not exists advertised_ring_bytes bigint;
alter table observations add column if not exists advertised_total_room_bytes bigint;
alter table observations add column if not exists advertised_retention_seconds integer;
alter table observations add column if not exists advertised_ephemeral_ttl_seconds integer;
alter table observations add column if not exists advertised_reads_per_minute integer;
alter table observations add column if not exists advertised_writes_per_minute integer;
alter table observations add column if not exists observed_window_bytes integer;
alter table observations add column if not exists miss_since bigint;
alter table observations add column if not exists miss_first_seq bigint;
alter table observations add column if not exists miss_skipped boolean;
alter table observations add column if not exists readable_depth integer;
alter table observations add column if not exists rate_remaining integer;
alter table observations add column if not exists http_429 boolean;
alter table observations add column if not exists did_note_sha256 text;
alter table observations add column if not exists did_note_mode text;
alter table observations add column if not exists contract_ok boolean;

alter table tracked_receipts add column if not exists death_mode text;
alter table tracked_receipts add column if not exists death_mode_detail text;

alter table receipt_checks add column if not exists death_mode text;
alter table receipt_checks add column if not exists death_mode_detail text;
