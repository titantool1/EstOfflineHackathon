import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSourceText, safeSourceUrl, sourceDomain } from "../src/features/sources/source-reference.ts";

test("HTTP(S) Markdown and bare URLs become links while surrounding Korean text stays text", () => {
  assert.deepEqual(parseSourceText("공식 [안내문](https://www.example.go.kr/guide)과 https://eco.example.org/info 를 확인해요."), [
    { kind: "text", text: "공식 " },
    { kind: "link", href: "https://www.example.go.kr/guide", label: "안내문" },
    { kind: "text", text: "과 " },
    { kind: "link", href: "https://eco.example.org/info", label: "https://eco.example.org/info" },
    { kind: "text", text: " 를 확인해요." },
  ]);
});

test("unsafe schemes, credentials, controls and disguised hosts never become links", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,x", "//example.test", "https://user:pass@example.test", "https://example.test\\@evil.test", "https://example.test\n/path"])
    assert.equal(safeSourceUrl(value), null);
  assert.deepEqual(parseSourceText("[위험](javascript:alert(1)) 그대로"), [{ kind: "text", text: "[위험](javascript:alert(1)) 그대로" }]);
});

test("an invalid bare URL does not hide a later valid URL", () => {
  assert.deepEqual(parseSourceText("https://user:pass@example.test 뒤 https://example.test/ok"), [
    { kind: "text", text: "https://user:pass@example.test 뒤 " },
    { kind: "link", href: "https://example.test/ok", label: "https://example.test/ok" },
  ]);
});

test("balanced URL parentheses stay in the link and sentence punctuation stays outside", () => {
  assert.deepEqual(parseSourceText("참고(https://example.test/a_(b)). 다음"), [
    { kind: "text", text: "참고(" },
    { kind: "link", href: "https://example.test/a_(b)", label: "https://example.test/a_(b)" },
    { kind: "text", text: "). 다음" },
  ]);
  assert.deepEqual(parseSourceText("[문서](https://example.test/a_(b))입니다."), [
    { kind: "link", href: "https://example.test/a_(b)", label: "문서" },
    { kind: "text", text: "입니다." },
  ]);
});

test("source domains are derived locally from safe URLs", () => {
  assert.equal(sourceDomain("https://www.example.go.kr/path?q=1"), "example.go.kr");
  assert.equal(sourceDomain("ftp://example.test/file"), null);
});
