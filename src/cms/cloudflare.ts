import type {
  Analytics,
  MetricGroup,
  MetricResult,
  PublishJob,
  Traffic,
  WorkersMetrics,
} from "./types";
import { providerJson } from "./provider";
export type CloudflareConfig = {
  token?: string;
  buildToken?: string;
  accountId?: string;
  siteTag?: string;
  workerName?: string;
  siteUrl: string;
};
type GraphResponse<T> = {
  data?: { viewer: { accounts: T[] } };
  errors?: { message: string }[];
};
type RumGroup = {
  count: number;
  sum: { visits: number };
  dimensions?: Record<string, string>;
};
async function graphql<T>(config: CloudflareConfig, query: string): Promise<T> {
  const response = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(`Cloudflare 请求失败（${response.status}）`);
  const result = await providerJson<GraphResponse<T>>(response);
  if (result.errors?.length)
    throw new Error(result.errors.map((error) => error.message).join("；"));
  if (!result.data?.viewer.accounts[0])
    throw new Error("Cloudflare 未返回账户数据，请检查权限");
  return result.data.viewer.accounts[0];
}
async function metric<T>(
  ready: boolean,
  action: () => Promise<T>,
): Promise<MetricResult<T>> {
  if (!ready)
    return {
      status: "unconfigured",
      data: null,
      message: "尚未配置 Cloudflare 统计凭据。请在连接设置查看所需参数。",
    };
  try {
    return {
      status: "ready",
      data: await action(),
      message: "Cloudflare 实际统计数据；可能存在采样和采集延迟。",
    };
  } catch (error) {
    return {
      status: "error",
      data: null,
      message: error instanceof Error ? error.message : "统计查询失败",
    };
  }
}
export async function cloudflareAnalytics(
  config: CloudflareConfig,
  days: number,
): Promise<Analytics> {
  const end = new Date().toISOString();
  const start = new Date(Date.now() - days * 86400000).toISOString();
  // 同一站点的 beacon 可能覆盖其他子域名，只统计博客及其 www 别名。
  const hostname = new URL(config.siteUrl).hostname.replace(/^www\./, "");
  const hosts = [hostname, `www.${hostname}`];
  const filter = `siteTag: ${JSON.stringify(config.siteTag)}, requestHost_in: ${JSON.stringify(hosts)}, datetime_geq: ${JSON.stringify(start)}, datetime_leq: ${JSON.stringify(end)}, bot: 0`;
  const scope = `accounts(filter: {accountTag: ${JSON.stringify(config.accountId)}})`;
  const groups = (name: string, dimension?: string, limit = 20) =>
    `${name}: rumPageloadEventsAdaptiveGroups(limit: ${limit}, filter: {${filter}}, orderBy: [count_DESC]) { count sum { visits } ${dimension ? `dimensions { ${dimension} }` : ""} }`;
  const [traffic, workers] = await Promise.all([
    metric<Traffic>(
      Boolean(config.token && config.accountId && config.siteTag),
      async () => {
        const result = await graphql<Record<string, RumGroup[]>>(
          config,
          `query { viewer { ${scope} { ${groups("total", undefined, 1)} ${groups("days", "date", 40)} ${groups("countries", "countryName")} ${groups("pages", "requestPath")} ${groups("referrers", "refererHost")} ${groups("devices", "deviceType")} } } }`,
        );
        const map = (rows: RumGroup[], dimension: string): MetricGroup[] =>
          rows.map((row) => ({
            name: row.dimensions?.[dimension] || "直接访问 / 未知",
            views: row.count,
            visits: row.sum.visits,
          }));
        return {
          views: result.total[0]?.count ?? 0,
          visits: result.total[0]?.sum.visits ?? 0,
          days: map(result.days, "date").sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
          countries: map(result.countries, "countryName"),
          pages: map(result.pages, "requestPath"),
          referrers: map(result.referrers, "refererHost"),
          devices: map(result.devices, "deviceType"),
        };
      },
    ),
    metric<WorkersMetrics>(
      Boolean(config.token && config.accountId && config.workerName),
      async () => {
        const result = await graphql<{
          workersInvocationsAdaptive: { sum: WorkersMetrics }[];
        }>(
          config,
          `query { viewer { ${scope} { workersInvocationsAdaptive(limit: 1, filter: {scriptName: ${JSON.stringify(config.workerName)}, datetime_geq: ${JSON.stringify(start)}, datetime_leq: ${JSON.stringify(end)}}) { sum { requests errors } } } } }`,
        );
        return (
          result.workersInvocationsAdaptive[0]?.sum ?? {
            requests: 0,
            errors: 0,
          }
        );
      },
    ),
  ]);
  return { days, start, end, traffic, workers };
}
export async function reconcileCloudflare(
  job: PublishJob,
  config: CloudflareConfig,
  containsCommit?: (ancestor: string, deployed: string) => Promise<boolean>,
): Promise<PublishJob> {
  if (!job.commit)
    return {
      ...job,
      message: "提交结果尚待确认，请检查 GitHub 提交记录后刷新",
    };
  // 直接核对线上构建的提交和内容摘要，不能仅凭 HTTP 200 宣称发布成功。
  try {
    const url = new URL("/cms-release.json", config.siteUrl);
    url.searchParams.set("cms", job.commit);
    const response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: { "Cache-Control": "no-cache" },
    });
    if (response.ok) {
      const release = await providerJson<{
        commit?: string;
        files?: Record<string, string>;
      }>(response);
      if (
        release.files?.[job.path] === job.digest &&
        release.commit &&
        (release.commit === job.commit ||
          (containsCommit &&
            (await containsCommit(job.commit, release.commit))))
      )
        return {
          ...job,
          status: "live",
          updatedAt: new Date().toISOString(),
          message: "线上提交版本与文章摘要均已核对，发布完成",
        };
    }
  } catch {
    /* 线上尚不可达时保留待确认状态，继续检查构建。 */
  }
  if (!(config.buildToken && config.accountId && config.workerName))
    return {
      ...job,
      message: "GitHub 已提交；线上版本尚未确认，Cloudflare 构建凭据未配置",
    };
  try {
    const headers = { Authorization: `Bearer ${config.buildToken}` };
    const workerResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/workers/scripts`,
      { headers, signal: AbortSignal.timeout(10000) },
    );
    if (!workerResponse.ok)
      throw new Error(`读取 Worker 配置失败（${workerResponse.status}）`);
    const workers = await providerJson<{
      result?: { id: string; tag: string }[];
    }>(workerResponse);
    const worker = workers.result?.find(
      (item) => item.id === config.workerName,
    );
    if (!worker?.tag) throw new Error("Worker tag 未返回，无法查询构建记录");
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/builds/workers/${worker.tag}/builds?per_page=50`,
      { headers, signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok) throw new Error(`查询构建失败（${response.status}）`);
    const result = await providerJson<{
      result?: {
        build_trigger_metadata?: { commit_hash?: string };
        build_outcome?: string;
        status?: string;
      }[];
    }>(response);
    const build = result.result?.find(
      (item) => item.build_trigger_metadata?.commit_hash === job.commit,
    );
    if (
      build &&
      ["fail", "cancelled", "terminated", "skipped"].includes(
        build.build_outcome || "",
      )
    )
      return {
        ...job,
        status: "failed",
        updatedAt: new Date().toISOString(),
        message: `Cloudflare 构建结果：${build.build_outcome}，内容尚未确认上线。草稿快照保留在发布记录中。`,
      };
    return {
      ...job,
      message: build
        ? `Cloudflare 构建：${build.build_outcome || build.status}；等待线上版本核对`
        : "等待 Cloudflare 为这次提交创建构建任务",
    };
  } catch (error) {
    return {
      ...job,
      message: `GitHub 已提交，构建查询暂不可用：${error instanceof Error ? error.message : "未知错误"}`,
    };
  }
}
