export type VisibilityStatus = "recorded" | "observable" | "near_edge" | "gone";

export type DeathMode =
  | "recorded"
  | "still_visible"
  | "near_edge"
  | "ring_overflow"
  | "ephemeral_ttl"
  | "idle_deleted"
  | "single_message_room"
  | "note_overwrite"
  | "note_drift"
  | "note_missing"
  | "note_ok"
  | "unknown_gone";

export type ReceiptRow = {
  id: number;
  label: string;
  room: string;
  seq: number;
  nonce: string | null;
  posted_at: string | null;
  text_preview: string | null;
  did: string;
  source: string;
  has_client_receipt: boolean;
  last_status: VisibilityStatus | string;
  last_visible_at: string | null;
  first_missing_at: string | null;
  last_sequences_ahead: number | null;
  last_checked_at: string | null;
  survival_seconds: number | null;
  in_live_window: boolean | null;
  death_mode: DeathMode | string | null;
  death_mode_detail: string | null;
};

export type ObservationRow = {
  id: number;
  observed_at: string;
  room: string;
  current_seq: number | null;
  previous_seq: number | null;
  sequence_growth: number | null;
  interval_seconds: number | null;
  velocity_per_minute: number | null;
  window_velocity_per_min: number | null;
  window_first_seq: number | null;
  window_last_seq: number | null;
  window_count: number | null;
  window_span: number | null;
  window_seconds: number | null;
  did_note_reachable: boolean | null;
  did_note_contains_did: boolean | null;
  did_note_http: number | null;
  anomaly: string | null;
  conclusion: string | null;
  probe_ok: boolean;
  error_message: string | null;
  source: string;
  advertised_ring_bytes: number | null;
  advertised_total_room_bytes: number | null;
  advertised_retention_seconds: number | null;
  advertised_ephemeral_ttl_seconds: number | null;
  advertised_reads_per_minute: number | null;
  advertised_writes_per_minute: number | null;
  observed_window_bytes: number | null;
  miss_since: number | null;
  miss_first_seq: number | null;
  miss_skipped: boolean | null;
  readable_depth: number | null;
  rate_remaining: number | null;
  http_429: boolean | null;
  did_note_sha256: string | null;
  did_note_mode: DeathMode | string | null;
  contract_ok: boolean | null;
};

export type ReceiptCheckRow = {
  id: number;
  observation_id: number;
  receipt_id: number;
  room: string;
  seq: number;
  in_live_window: boolean;
  missed_by_ring: boolean;
  sequences_ahead: number | null;
  window_first_seq: number | null;
  window_last_seq: number | null;
  window_span: number | null;
  visibility_status: VisibilityStatus | string;
  matches_did: boolean | null;
  survival_seconds: number | null;
  observed_at?: string;
  death_mode: DeathMode | string | null;
  death_mode_detail: string | null;
};

export type VelocityPoint = {
  id: number;
  observed_at: string;
  current_seq: number | null;
  sequence_growth: number | null;
  velocity_per_minute: number | null;
  window_velocity_per_min: number | null;
  window_seconds: number | null;
  anomaly: string | null;
  probe_ok: boolean;
};

export type ServiceContract = {
  ringBytes: number | null;
  totalRoomBytes: number | null;
  retentionSeconds: number | null;
  ephemeralTtlSeconds: number | null;
  readsPerMinute: number | null;
  writesPerMinute: number | null;
  version: string | null;
  durableClaim: boolean | null;
  ok: boolean;
};

export type DashboardPayload = {
  agent: {
    name: string;
    purpose: string;
    did: string;
    repo: string;
    protocol: string;
    didNoteUrl: string;
    primaryRoom: string;
    firstTrackedSeq: number;
    status: "observing" | "calibrating" | "error" | "idle";
    lastObservationAt: string | null;
    nextDueAt: string | null;
  };
  latest: ObservationRow | null;
  primaryCheck: ReceiptCheckRow | null;
  receipts: ReceiptRow[];
  observations: ObservationRow[];
  velocity: VelocityPoint[];
  checksByReceipt: Record<number, ReceiptCheckRow[]>;
  didNotePreview: string | null;
  generatedAt: string;
  persistence: "neon" | "pglite";
  observePath: string;
  events: AgentEventPublic[];
  survival: SurvivalPublic[];
  postingEnabled: boolean;
};

export type AgentEventPublic = {
  id: number;
  created_at: string;
  event_type: string;
  room: string;
  subject: string;
  title: string;
  pointer_text: string;
  posted: boolean;
  posted_seq: number | null;
  skip_reason: string | null;
};

export type SurvivalPublic = {
  room: string;
  asOf: string;
  windowSpan: number | null;
  velocityPerMinute: number | null;
  survive60s: number | null;
  survive5min: number | null;
  trailingHour60s: number | null;
  samples: number;
};
