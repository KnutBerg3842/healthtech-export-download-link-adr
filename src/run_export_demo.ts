import { createAppointmentExportDownload } from "./appointment_export";

const sampleRequest = {
  exportId: "exp_2026_03_14_morning",
  clinicId: "north-hall",
  requestedBy: {
    userId: "ops_17",
    name: "Riley Chen"
  },
  appointments: [
    {
      appointmentId: "apt_1001",
      patientId: "pt_501",
      patientName: "Ava Patel",
      startIso: "2026-03-14T09:00:00Z",
      status: "scheduled",
      smsOptIn: true,
      careTeamEmail: "triage@north-hall.example"
    },
    {
      appointmentId: "apt_1002",
      patientId: "pt_502",
      patientName: "Mason Rivera",
      startIso: "2026-03-14T09:30:00Z",
      status: "cancelled",
      smsOptIn: false,
      careTeamEmail: "triage@north-hall.example"
    }
  ]
};

const result = await createAppointmentExportDownload(sampleRequest);
console.log(JSON.stringify(result, null, 2));
