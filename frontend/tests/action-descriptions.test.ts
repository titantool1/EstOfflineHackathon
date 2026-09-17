import { test } from "node:test";
import assert from "node:assert/strict";
import { actionDescription } from "../src/features/missions/action-descriptions.ts";
test("same-program actions have distinct mission labels and instructions", () => {
  const rows = ["A02", "A05", "A08"].map(id => actionDescription("scheme:KR-CNP-GREEN-2026", `KR-CNP-GREEN-2026-${id}`)!);
  assert.match(rows[0].title, /텀블러/); assert.match(rows[1].title, /다회용기/); assert.match(rows[2].title, /재활용품/);
  assert.equal(new Set(rows.map(r => r.title)).size, 3); assert.equal(new Set(rows.map(r => r.summary)).size, 3);
});
test("school challenge remains distinct from everyday climate activities", () => {
  assert.match(actionDescription("scheme:G002", "G002-A01")!.summary, /퀴즈/);
  assert.match(actionDescription("scheme:G002", "G002-A02")!.summary, /모집/);
});
test("unknown or mismatched actions retain their existing fallback", () => {
  assert.equal(actionDescription("scheme:other", "G002-A01"), undefined);
  assert.equal(actionDescription("scheme:G002", "unknown"), undefined);
});
