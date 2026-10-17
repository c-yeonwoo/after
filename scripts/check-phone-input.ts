import assert from "node:assert/strict";
import { phoneInputDigits } from "../src/lib/phone-input";

const cases = [
  ["", ""],
  ["010", "010"],
  ["01012345678", "01012345678"],
  ["010-1234-5678", "01012345678"],
  ["010 1234 5678", "01012345678"],
  ["+82 10-1234-5678", "01012345678"],
  ["+821012345678", "01012345678"],
  ["abc010-1234-5678", "01012345678"],
  ["010123456789", "010123456789"], // Do not silently truncate an invalid number.
] as const;

for (const [input, expected] of cases) assert.equal(phoneInputDigits(input), expected, input);
console.log(`Phone input: ${cases.length} display and paste cases PASS`);
