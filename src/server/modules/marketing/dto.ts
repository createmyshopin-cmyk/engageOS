import "server-only";

/**
 * Marketing DTOs — the wire shape for the merchant marketing read model.
 *
 * Sourced from the existing `whatsapp_broadcasts` launch ledger (0027): the row
 * EngageOS keeps for every broadcast it fired, plus the delivery counters the
 * webhook/refresh path maintains. This is a read projection only — no send is
 * triggered here. The internal wacrm_broadcast_id and created_by stay
 * server-side; the list is a channel-agnostic marketing "send" header.
 */

export interface BroadcastListItemDTO {
  id: string;
  channel: "whatsapp";
  name: string;
  templateName: string;
  templateLanguage: string;
  segment: string;
  status: string;
  totalRecipients: number;
  accepted: number;
  rejected: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  createdAt: string;
}

/** Row shape selected from whatsapp_broadcasts (tenant-scoped). */
export interface BroadcastListRow {
  id: string;
  name: string;
  template_name: string;
  template_language: string;
  segment: string;
  status: string;
  total_recipients: number | string | null;
  accepted: number | string | null;
  rejected: number | string | null;
  sent_count: number | string | null;
  delivered_count: number | string | null;
  read_count: number | string | null;
  failed_count: number | string | null;
  created_at: string;
}

const n = (v: number | string | null | undefined): number => Number(v) || 0;

export function toBroadcastListItemDTO(row: BroadcastListRow): BroadcastListItemDTO {
  return {
    id: row.id,
    channel: "whatsapp",
    name: row.name,
    templateName: row.template_name,
    templateLanguage: row.template_language,
    segment: row.segment,
    status: row.status,
    totalRecipients: n(row.total_recipients),
    accepted: n(row.accepted),
    rejected: n(row.rejected),
    sent: n(row.sent_count),
    delivered: n(row.delivered_count),
    read: n(row.read_count),
    failed: n(row.failed_count),
    createdAt: row.created_at,
  };
}
