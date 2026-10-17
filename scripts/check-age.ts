import assert from "node:assert/strict";
import { ageFrom, basicsValid, emptyBasics } from "../src/components/onboarding/basics";

const now = new Date("2026-10-17T15:00:00Z"); // 한국에서는 10월 18일 자정
const cases: [string, number | null][] = [
  ["2007-10-18", 19],
  ["2007-10-19", 18],
  ["2007-10-17", 19],
  ["2026-10-19", -1],
  ["2026-10-18", 0],
  ["1947-10-18", 79],
  ["1946-10-18", 80],
  ["2004-02-29", 22],
  ["2007-02-29", null],
  ["2007-02-30", null],
  ["2007-13-01", null],
  ["2007-00-01", null],
  ["2007-01-00", null],
  ["2007-1-1", null],
  ["2007-10-18T00:00:00Z", null],
  ["", null],
  ["not-a-date", null],
];
for (const [birth, expected] of cases) assert.equal(ageFrom(birth, now), expected, birth);
assert.equal(ageFrom("2007-10-18", new Date("2026-10-17T14:59:59Z")), 18);
assert.equal(ageFrom("2004-02-29", new Date("2023-02-28T03:00:00Z")), 18);
assert.equal(ageFrom("2004-02-29", new Date("2023-03-01T03:00:00Z")), 19);
assert.equal(ageFrom("2000-01-01", new Date("invalid")), null);
const complete = {
  ...emptyBasics,
  name: "테스트",
  photos: ["1.png", "2.png", "3.png"],
  job: "기획자",
  birth: "1993-05-12",
};
assert.equal(basicsValid(complete), true);
for (const birth of ["", "2020-01-01", "2099-01-01", "1993-02-30"])
  assert.equal(basicsValid({ ...complete, birth }), false, birth);
console.log(`Age gate: ${cases.length + 9} date and signup validation cases PASS`);
