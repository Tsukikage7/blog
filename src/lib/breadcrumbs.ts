import { canonicalPath } from "./site";
import { lowerHumanize } from "./textConverter";

const labels: Record<string, string> = {
  blog: "文章",
  series: "系列合集",
  categories: "分类",
  tags: "标签",
  notes: "笔记",
  writings: "创作",
  about: "关于",
  search: "搜索",
  music: "音乐馆",
  terms: "使用条款",
};

export function breadcrumbs(pathname: string, title?: string) {
  const paths = pathname.split("/").filter(Boolean);
  return [
    { label: "首页", href: "/" },
    ...paths.flatMap((part, index) =>
      index === 1 && paths[0] === "writings" && part === "works"
        ? []
        : [
            {
              label:
                index === paths.length - 1 && title
                  ? title
                  : labels[part] ||
                    (/^\d+$/.test(part)
                      ? `第 ${part} 页`
                      : lowerHumanize(
                          decodeURIComponent(part).replace(/[-_]/g, " "),
                        )),
              href: canonicalPath(`/${paths.slice(0, index + 1).join("/")}`),
            },
          ],
    ),
  ];
}
