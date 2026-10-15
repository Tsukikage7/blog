import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import subsetFont from "subset-font";

// 字体保留在本地缓存，页面只使用提交到 public 的 WOFF2 子集。
const sourceUrl =
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf";
const cachedFont = ".cms/font-source/NotoSansSC.ttf";
await mkdir(".cms/font-source", { recursive: true });
await mkdir("public/fonts/cms", { recursive: true });
let font;
try {
  font = await readFile(cachedFont);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`字体下载失败：${response.status}`);
  font = Buffer.from(await response.arrayBuffer());
  await writeFile(cachedFont, font);
}
let text =
  Array.from({ length: 95 }, (_, index) =>
    String.fromCodePoint(index + 32),
  ).join("") + "年月日星期一二三四五六零〇";
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else if (/\.(?:md|mdx|ts|tsx)$/.test(path))
      text += await readFile(path, "utf8");
  }
}
await collect("src/content");
await collect("src/components/cms");
await collect("src/cms");
const charset = [...new Set(text)].join("");
const output = await subsetFont(font, charset, {
  targetFormat: "woff2",
  variationAxes: { wght: { min: 400, max: 700 } },
});
await writeFile("public/fonts/cms/noto-sans-sc.woff2", output);
await writeFile(
  "public/fonts/cms/source.json",
  JSON.stringify(
    {
      family: "Noto Sans SC",
      license: "SIL Open Font License 1.1",
      source: sourceUrl,
      sourceSha256: createHash("sha256").update(font).digest("hex"),
      characters: [...charset].length,
      bytes: output.length,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `CMS 中文字体：${[...charset].length} 字符，${Math.round(output.length / 1024)} KiB`,
);
