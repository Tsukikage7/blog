// 只读取 GitHub 公开贡献图；任何缺失或结构变化都不能当成零贡献。
export const GITHUB_USERNAME = "Tsukikage7";

export function parseContributions(html, year) {
  const attribute = (tag, name) =>
    tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`))?.[1];
  const tooltips = new Map();
  for (const match of html.matchAll(
    /<tool-tip\b([^>]*)>([\s\S]*?)<\/tool-tip>/g,
  )) {
    const text = match[2].replace(/<[^>]*>/g, "").trim();
    const count = /^No contributions on /.test(text)
      ? 0
      : Number(
          text.match(/^([\d,]+) contributions? on /)?.[1].replaceAll(",", ""),
        );
    tooltips.set(attribute(match[1], "for"), count);
  }
  const days = new Map();
  for (const match of html.matchAll(
    /<td\b[^>]*\bdata-date=["'][^"']+["'][^>]*>/g,
  )) {
    const date = attribute(match[0], "data-date");
    if (!date?.startsWith(`${year}-`)) continue;
    const count = tooltips.get(attribute(match[0], "id"));
    const level = Number(attribute(match[0], "data-level"));
    if (
      !Number.isSafeInteger(count) ||
      count < 0 ||
      !Number.isInteger(level) ||
      level < 0 ||
      level > 4 ||
      days.has(date)
    ) {
      throw new Error(`GitHub 贡献日期数据不完整：${date}`);
    }
    days.set(date, { date, count, level });
  }
  const expectedDays =
    (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
  const total = [...days.values()].reduce((sum, day) => sum + day.count, 0);
  const heading = html
    .match(/<h2\b[^>]*>[\s\S]*?<\/h2>/)?.[0]
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ");
  const reported = heading?.match(
    new RegExp(`([\\d,]+) contributions? in ${year}`),
  );
  for (let index = 0; index < expectedDays; index++) {
    const date = new Date(Date.UTC(year, 0, index + 1))
      .toISOString()
      .slice(0, 10);
    if (!days.has(date)) throw new Error(`GitHub 缺少日期：${date}`);
  }
  if (!reported || Number(reported[1].replaceAll(",", "")) !== total) {
    throw new Error("GitHub 每日贡献合计与官方总数不一致");
  }
  return {
    total,
    days: [...days.values()]
      .filter((day) => day.count > 0)
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
