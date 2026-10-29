import { z } from "zod";
import { infrai } from "./infrai";

export const appointmentExportRequestSchema = z.object({
  exportId: z.string().min(1),
  clinicId: z.string().min(1),
  requestedBy: z.object({
    userId: z.string().min(1),
    name: z.string().min(1)
  }),
  appointments: z.array(
    z.object({
      appointmentId: z.string().min(1),
      patientId: z.string().min(1),
      patientName: z.string().min(1),
      startIso: z.string().min(1),
      status: z.enum(["scheduled", "checked_in", "completed", "cancelled"]),
      smsOptIn: z.boolean(),
      careTeamEmail: z.string().email().optional()
    })
  ).min(1)
});

export type AppointmentExportRequest = z.infer<typeof appointmentExportRequestSchema>;

export type OperationalNotice = {
  channel: "none" | "email";
  audience: "none" | "care_team";
  message: string;
};

export type ExportDecision = {
  csv: string;
  objectKey: string;
  downloadFilename: string;
  notification: OperationalNotice;
  pdfHtml: string;
};

export function planAppointmentExport(input: AppointmentExportRequest): ExportDecision {
  const completed = input.appointments.filter((appt) => appt.status === "completed").length;
  const cancelled = input.appointments.filter((appt) => appt.status === "cancelled").length;
  const unsentSafeAlerts = input.appointments.filter((appt) => appt.status === "cancelled" && appt.smsOptIn === false);

  const csvRows = [
    ["appointment_id", "patient_id", "patient_name", "start_iso", "status", "sms_opt_in"],
    ...input.appointments.map((appt) => [
      appt.appointmentId,
      appt.patientId,
      appt.patientName,
      appt.startIso,
      appt.status,
      String(appt.smsOptIn)
    ])
  ];

  const csv = csvRows.map((row) => row.map(csvCell).join(",")).join("\n");
  const objectKey = `exports/${input.clinicId}/${input.exportId}.csv`;
  const downloadFilename = `appointments-${input.clinicId}-${input.exportId}.csv`;

  const hasCareTeamEmail = input.appointments.some((appt) => Boolean(appt.careTeamEmail));
  const notification: OperationalNotice = unsentSafeAlerts.length > 0 && hasCareTeamEmail
    ? {
        channel: "email",
        audience: "care_team",
        message: `${unsentSafeAlerts.length} cancelled appointments had SMS opt-out. Send a staff-only follow-up before sharing the export link.`
      }
    : {
        channel: "none",
        audience: "none",
        message: "No extra operational notice required."
      };

  const pdfHtml = [
    "<html><body>",
    `<h1>Appointment export handoff</h1>`,
    `<p>Clinic: ${escapeHtml(input.clinicId)}</p>`,
    `<p>Export: ${escapeHtml(input.exportId)}</p>`,
    `<p>Requested by: ${escapeHtml(input.requestedBy.name)} (${escapeHtml(input.requestedBy.userId)})</p>`,
    `<p>Total appointments: ${input.appointments.length}</p>`,
    `<p>Completed: ${completed}</p>`,
    `<p>Cancelled: ${cancelled}</p>`,
    `<p>Operational notice: ${escapeHtml(notification.message)}</p>`,
    "</body></html>"
  ].join("");

  return {
    csv,
    objectKey,
    downloadFilename,
    notification,
    pdfHtml
  };
}

export async function ensureExportBucket(bucketName: string): Promise<void> {
  await infrai.storage.bucket.create({ name: bucketName });
}

export async function createAppointmentExportDownload(input: unknown, opts?: { bucketName?: string; expiresSeconds?: number }) {
  const parsed = appointmentExportRequestSchema.parse(input);
  const decision = planAppointmentExport(parsed);
  const bucketName = opts?.bucketName ?? "healthtech-appointment-exports";
  const expiresSeconds = opts?.expiresSeconds ?? 900;

  await ensureExportBucket(bucketName);

  const idempotencyKey = parsed.exportId;
  await infrai.storage.object.put(bucketName, decision.objectKey, {
    data_base64: Buffer.from(decision.csv, "utf8").toString("base64"),
    content_type: "text/csv",
    idempotency_key: idempotencyKey
  });

  const signed = await infrai.storage.object.presign(bucketName, decision.objectKey, {
    op: "get",
    expires_seconds: expiresSeconds,
    response_disposition: `attachment; filename=\"${decision.downloadFilename}\"`,
    idempotency_key: idempotencyKey
  });

  const pdf = await infrai.pdf.generate({
    html: decision.pdfHtml,
    page_size: "A4",
    orientation: "portrait",
    store: true
  });

  return {
    bucketName,
    objectKey: decision.objectKey,
    downloadUrl: signed.data.url,
    notification: decision.notification,
    handoffDocument: pdf.data
  };
}

function csvCell(value: string): string {
  const escaped = value.replaceAll('"', '""');
  return /[",\n]/.test(value) ? `"${escaped}"` : escaped;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
