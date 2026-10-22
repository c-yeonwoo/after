import assert from "node:assert/strict";
import { formatMeetTime } from "../src/lib/meet";

const original = process.env.TZ;
try {
  for (const timezone of ["UTC", "Asia/Seoul", "America/Los_Angeles"]) {
    process.env.TZ = timezone;
    assert.equal(formatMeetTime("2026-10-22T10:15:00Z"), "10월 22일 (목) 저녁 7시 15분");
    assert.equal(formatMeetTime("2026-10-22T10:30:00Z"), "10월 22일 (목) 저녁 7시 반");
    assert.equal(formatMeetTime("2026-10-22T15:00:00Z"), "10월 23일 (금) 오전 12시");
    assert.equal(formatMeetTime("2026-10-22T03:00:00Z"), "10월 22일 (목) 낮 12시");
  }
} finally {
  if (original === undefined) delete process.env.TZ;
  else process.env.TZ = original;
}
console.log("Meeting time: exact minutes and Seoul day boundary PASS");
