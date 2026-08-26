export type VisibilityStatus = "recorded" | "observable" | "near_edge" | "gone";

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
};
