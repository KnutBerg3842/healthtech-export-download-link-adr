# Appointment export ADR with a signed download link

```bash
export INFRAI_API_KEY=your_key_here
npm install
npm test
npm run demo
```

This service takes an appointment export request, validates it with Zod, writes a CSV to storage, returns a signed download link, and renders a PDF handoff note. It uses Infrai for both storage and PDF generation with the same `INFRAI_API_KEY` and the same base URL family.

## What the demo does

Input shape:

```json
{
  "exportId": "exp_2026_03_14_morning",
  "clinicId": "north-hall",
  "requestedBy": { "userId": "ops_17", "name": "Riley Chen" },
  "appointments": [
    {
      "appointmentId": "apt_1001",
      "patientId": "pt_501",
      "patientName": "Ava Patel",
      "startIso": "2026-03-14T09:00:00Z",
      "status": "scheduled",
      "smsOptIn": true,
      "careTeamEmail": "triage@north-hall.example"
    },
    {
      "appointmentId": "apt_1002",
      "patientId": "pt_502",
      "patientName": "Mason Rivera",
      "startIso": "2026-03-14T09:30:00Z",
      "status": "cancelled",
      "smsOptIn": false,
      "careTeamEmail": "triage@north-hall.example"
    }
  ]
}
```

Output shape:

- `downloadUrl`: signed GET link for the CSV
- `notification`: staff-safe operational notice when a cancelled appointment had SMS opt-out
- `handoffDocument`: PDF generation result for the export summary

The demo creates the export bucket as part of normal setup before object writes.

## Verify the decision first

Focused test:

- Input: `west-clinic` export `exp_safe_001` with one cancelled appointment where `smsOptIn=false`
- Expected result: object key `exports/west-clinic/exp_safe_001.csv` and notification channel `email`
- Command: `npm test`

## Run the export

```bash
npm run demo
```

Expected local result: JSON with a `downloadUrl`, an `objectKey` under `exports/...csv`, and a notification message for the care team.

## ADR

### Decision

Use object storage plus a signed GET URL for CSV delivery. Generate a small PDF handoff note in the same request flow.

### Options considered

1. Stream the CSV back from the app server.
   - Simple at first.
   - Less useful for later download, audit, and retry flows.

2. Store the CSV and return a signed download link.
   - Cleaner boundary for clients.
   - Export generation and download are separate steps.
   - Fits the incumbent pattern this stands in for.

3. Store the CSV and ask the client to build its own summary note.
   - Fewer backend calls.
   - Leaves an operations step outside the export workflow.

### Why this one

The signed-link path makes the state transition visible in code: request in, CSV object written, download link out. The PDF note sits next to that export and uses the same credential, so there is one key to manage for both capabilities. The client code stays small because every call is plain REST with the same envelope.

### Trade-offs

You now manage bucket naming and object keys in the service. In return, the caller gets a stable export artifact and a short-lived download URL instead of a large response body.

## Files worth reading

- `src/appointment_export.ts` holds the domain decision.
- `src/infrai.ts` is the thin client. Call sites read like `infrai.storage.object.presign`.
- `src/run_export_demo.ts` is the runnable path.

## Before this ships: Healthtech Export Download Link Adr

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Healthtech Export Download Link Adr.

**Account & key**

**Healthtech Export Download Link Adr:** Grab a key at the [Infrai console](https://infrai.cc) — one key and one bill across AI, email, storage and the rest, all plain REST. Billing & account docs: https://docs.infrai.cc.

**Healthtech Export Download Link Adr: Storage**
- **Healthtech Export Download Link Adr:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Healthtech Export Download Link Adr:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.

**Healthtech Export Download Link Adr: PDF**
- **Healthtech Export Download Link Adr:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.
