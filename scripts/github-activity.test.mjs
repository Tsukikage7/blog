import assert from "node:assert/strict";
import test from "node:test";
import { parseContributions } from "./github-activity.mjs";

const fixture = (year, count = 1234) => {
  const length = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  return (
    `<h2>${count.toLocaleString("en-US")} contributions in ${year}</h2>` +
    Array.from({ length }, (_, i) => {
      const date = new Date(Date.UTC(year, 0, i + 1))
        .toISOString()
        .slice(0, 10);
      return `<td id="day-${i}" data-level="${i ? 0 : 4}" data-date="${date}"></td><tool-tip for="day-${i}">${i ? "No contributions" : `${count.toLocaleString("en-US")} contributions`} on January 1st.</tool-tip>`;
    }).join("")
  );
};
test("解析官方每日提示，校验闰年和总数，逗号不会截断贡献数", () => {
  assert.deepEqual(parseContributions(fixture(2024), 2024), {
    total: 1234,
    days: [{ date: "2024-01-01", count: 1234, level: 4 }],
  });
  assert.equal(parseContributions(fixture(2026, 0), 2026).total, 0);
});
test("页面结构或数据不完整时报错，不能生成假的零贡献", () => {
  assert.throws(() => parseContributions("<html>Rate limit</html>", 2026));
  assert.throws(() =>
    parseContributions(
      fixture(2026).replace('for="day-0"', 'for="missing"'),
      2026,
    ),
  );
  assert.throws(() =>
    parseContributions(
      fixture(2026).replace("1,234 contributions in", "12 contributions in"),
      2026,
    ),
  );
});
