import assert from "node:assert/strict";
import test from "node:test";
import { buildActivityCalendar } from "./activityCalendar";

test("博客和 GitHub 同日活跃只计一天，过滤未来发布和其他年份", () => {
  const calendar = buildActivityCalendar(
    "2026-10-05",
    ["2026-01-01", "2026-01-01", "2026-01-02", "2026-12-01", "2025-01-01"],
    [
      { date: "2026-01-01", count: 5, level: 2 },
      { date: "2026-01-03", count: 2, level: 1 },
      { date: "2026-12-01", count: 10, level: 3 },
    ],
  );
  assert.deepEqual(calendar.stats, {
    total: 10,
    activeDays: 3,
  });
  const day = calendar.weeks.flat().find((day) => day.date === "2026-01-01")!;
  assert.equal(day.count, 7);
});

test("闰年与年尾完整覆盖，每个日期只出现一次，月份按周定位", () => {
  for (const year of [2024, 2026, 2028]) {
    const calendar = buildActivityCalendar(
      `${year}-12-31`,
      [`${year}-12-31`],
      [],
    );
    const days = calendar.weeks.flat().filter((day) => !day.outside);
    assert.equal(days.length, year === 2026 ? 365 : 366);
    assert.equal(new Set(days.map((day) => day.date)).size, days.length);
    assert.equal(days.at(-1)?.count, 1);
    assert.equal(calendar.months.length, 12);
    assert.ok(
      calendar.months.every((month) => month.column <= calendar.weeks.length),
    );
  }
});
