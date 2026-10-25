import assert from "node:assert/strict";
import { photoTips, type PhotoObservation } from "../src/lib/photoCoaching";

const ordinary: PhotoObservation = {
  width: 1200,
  height: 1600,
  meanBrightness: 145,
  darkFraction: 0.1,
  lightFraction: 0.1,
};
assert.deepEqual(photoTips(ordinary), []);
assert.deepEqual(photoTips(null), []);
assert.deepEqual(photoTips({ ...ordinary, width: NaN }), []);
assert.deepEqual(photoTips({ ...ordinary, height: 0 }), []);
assert.equal(photoTips({ ...ordinary, width: 240 })[0]?.kind, "resolution");
assert.equal(photoTips({ ...ordinary, meanBrightness: 20, darkFraction: 0.9 })[0]?.kind, "dark");
assert.equal(photoTips({ ...ordinary, meanBrightness: 250, lightFraction: 0.9 })[0]?.kind, "light");
assert.equal(photoTips({ ...ordinary, width: 2400, height: 800 })[0]?.kind, "crop");
// A dark background alone must not judge the subject as too dark.
assert.deepEqual(photoTips({ ...ordinary, meanBrightness: 90, darkFraction: 0.7 }), []);
// No selfie/body type/face/personality judgment is inferred from pixels or aspect ratio.
assert.ok(
  photoTips({ ...ordinary, width: 300 }).every((tip) => !/셀카|성격|매력|점수|합격/.test(tip.text)),
);
console.log("PASS photo coaching: dimensions/exposure only; unavailable evidence stays unknown");
