import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// 仅公开提交标识和摘要，不公开草稿或正文。
const files = {};
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile() && /\.mdx?$/.test(path))
      files[path] = createHash("sha256")
        .update(await readFile(path))
        .digest("hex");
  }
}
await walk("src/content");
const commit =
  process.env.WORKERS_BUILD_COMMIT ||
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
await writeFile(
  "public/cms-release.json",
  JSON.stringify({ commit, builtAt: new Date().toISOString(), files }),
);
console.log(`CMS release: ${Object.keys(files).length} content digests`);
