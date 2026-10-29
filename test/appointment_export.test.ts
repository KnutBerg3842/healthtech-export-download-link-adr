import test from "node:test";
import assert from "node:assert/strict";
import { planAppointmentExport } from "../src/appointment_export";

test("cancelled appointment with SMS opt-out triggers a care-team notice and stable CSV key", () => {
  const result = planAppointmentExport({
    exportId: "exp_safe_001",
    clinicId: "west-clinic",
    requestedBy: {
      userId: "ops_22",
      name: "June Park"
    },
    appointments: [
      {
        appointmentId: "apt_1",
        patientId: "pt_1",
        patientName: "Elena Stone",
        startIso: "2026-02-10T10:00:00Z",
        status: "cancelled",
        smsOptIn: false,
        careTeamEmail: "care@west.example"
      },
      {
        appointmentId: "apt_2",
        patientId: "pt_2",
        patientName: "Leo Hart",
        startIso: "2026-02-10T11:00:00Z",
        status: "completed",
        smsOptIn: true,
        careTeamEmail: "care@west.example"
      }
    ]
  });

  assert.equal(result.objectKey, "exports/west-clinic/exp_safe_001.csv");
  assert.equal(result.downloadFilename, "appointments-west-clinic-exp_safe_001.csv");
  assert.equal(result.notification.channel, "email");
  assert.match(result.notification.message, /1 cancelled appointments had SMS opt-out/);
  assert.match(result.csv, /appointment_id,patient_id,patient_name,start_iso,status,sms_opt_in/);
  assert.match(result.csv, /apt_1,pt_1,Elena Stone,2026-02-10T10:00:00Z,cancelled,false/);
});
