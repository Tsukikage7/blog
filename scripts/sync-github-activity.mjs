import { readFile, writeFile, mkdir } from "node:fs/promises";
import { GITHUB_USERNAME, parseContributions } from "./github-activity.mjs";

const file = new URL("../src/data/github-activity.json", import.meta.url);
const year = new Date().getUTCFullYear();
let cached;
try {
  cached = JSON.parse(await readFile(file, "utf8"));
} catch {}
// 开发和连续构建复用六小时内的快照，显式同步可使用 --force。
if (
  !process.argv.includes("--force") &&
  cached?.username === GITHUB_USERNAME &&
  cached.year === year &&
  Date.now() - Date.parse(cached.fetchedAt) < 6 * 3600000
) {
  console.log(`[GitHub] 复用 ${cached.fetchedAt} 的贡献快照`);
} else {
  try {
    const source = `https://github.com/users/${GITHUB_USERNAME}/contributions?from=${year}-01-01&to=${year}-12-31`;
    const response = await fetch(source, {
      signal: AbortSignal.timeout(20000),
      headers: { Accept: "text/html" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = parseContributions(await response.text(), year);
    const data = {
      username: GITHUB_USERNAME,
      year,
      fetchedAt: new Date().toISOString(),
      source,
      ...parsed,
    };
    await mkdir(new URL("../src/data/", import.meta.url), { recursive: true });
    await writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`[GitHub] 已同步 ${year} 年 ${parsed.total} 次贡献`);
  } catch (error) {
    if (cached)
      console.warn(
        `[GitHub] 同步失败，保留 ${cached.fetchedAt} 的快照：${error.message}`,
      );
    else throw error;
  }
}
