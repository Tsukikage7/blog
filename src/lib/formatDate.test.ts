import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { formatDate } from "./formatDate";

test("晚间发布时间保留 YAML 中的日期，不跨到次日", () => {
  assert.equal(formatDate(new Date("2025-12-19T21:00:00Z")), "2025-12-19");
  assert.equal(formatDate("2026-01-01T00:00:00Z"), "2026-01-01");
});

test("保留自定义日期格式，正确显示闰日", () => {
  assert.equal(formatDate("2024-02-29T22:00:00Z", "yyyy/MM/dd"), "2024/02/29");
});

test("UTC 云端、亚洲本机与美国读者显示相同的内容日期", () => {
  const moduleUrl = new URL("./formatDate.ts", import.meta.url).href;
  const script = `import { formatDate } from ${JSON.stringify(moduleUrl)}; console.log(formatDate("2025-12-19T21:00:00Z"), formatDate("2026-01-01T00:00:00Z"));`;
  for (const timeZone of ["UTC", "Asia/Singapore", "America/Los_Angeles"]) {
    const result = execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "-e", script],
      { env: { ...process.env, TZ: timeZone }, encoding: "utf8" },
    );
    assert.equal(result.trim(), "2025-12-19 2026-01-01", timeZone);
  }
});
