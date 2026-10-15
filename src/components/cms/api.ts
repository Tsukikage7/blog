export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const [pathname, query] = path.split("?");
  const response = await fetch(
    `/admin/api${pathname}/${query ? `?${query}` : ""}`,
    {
      ...options,
      credentials: "same-origin",
      headers: {
        "X-CMS-Request": "1",
        ...(options.body && typeof options.body === "string"
          ? { "Content-Type": "application/json" }
          : {}),
        ...options.headers,
      },
    },
  );
  let data: T & { error?: string };
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "管理 API 尚未启动。请使用 pnpm dev，或检查 Cloudflare CMS 配置。",
    );
  }
  if (!response.ok)
    throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}
export const formatTime = (value?: string) =>
  value
    ? new Date(value).toLocaleString("zh-CN", {
        timeZone: "Asia/Singapore",
        hour12: false,
      })
    : "未设置";
export const displayDate = (value: unknown) =>
  typeof value === "string" ? value.slice(0, 10) : "未设置";
