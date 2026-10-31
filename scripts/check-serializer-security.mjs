import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { serialize } from "seroval";

test("serialized regular expressions escape HTML while preserving their meaning", () => {
  const value = new RegExp("(?<name>after)|<script>", "iu");
  const output = serialize(value);
  assert.doesNotMatch(output, /</, "HTML-sensitive regex syntax must not enter the script raw");
  const restored = runInNewContext(`(${output})`);
  assert.equal(restored.source, value.source);
  assert.equal(restored.flags, value.flags);
  assert.equal(restored.test("AFTER"), true);
});

test("typed array serialization ignores an untrusted own constructor", () => {
  const value = new Uint8Array([3, 7]);
  Object.defineProperty(value, "constructor", {
    value: { name: "(()=>{globalThis.afterInjected=true;return Uint8Array})()" },
  });
  const output = serialize(value);
  assert.doesNotMatch(output, /afterInjected/);
  assert.deepEqual(Array.from(runInNewContext(`(${output})`, { atob })), [3, 7]);
});

test("ordinary profile and message strings remain safe in SSR output", () => {
  const value = { text: "퇴근 후 커피 한 잔? </script><script>afterInjected=true</script>" };
  const output = serialize(value);
  assert.doesNotMatch(output, /</);
  assert.equal(runInNewContext(`(${output})`).text, value.text);
});
