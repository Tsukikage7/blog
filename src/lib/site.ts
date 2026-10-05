// 站点规范地址供构建配置、页面元数据和订阅源共同使用。
export const SITE_URL = "https://tsukikage7.com";

export function canonicalPath(path: string): string {
  const pathname = path.split(/[?#]/, 1)[0].replace(/\/{2,}/g, "/");
  if (pathname === "/" || /\.[a-z0-9]+$/i.test(pathname)) return pathname;
  return `${pathname.replace(/\/$/, "")}/`;
}

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).href;
}

export function canonicalUrl(path: string): string {
  return absoluteUrl(canonicalPath(path));
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
