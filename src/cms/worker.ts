import { createRemoteJWKSet, jwtVerify } from "jose";
import { handleApi, json } from "./http";
import { SqlStore } from "./store";
import { GitHubRepository } from "./github";
import { cloudflareAnalytics, reconcileCloudflare } from "./cloudflare";
import { imageFile } from "./media";
import { CmsError, type Backend } from "./types";

type CmsEnv = {
  [Key in keyof Cloudflare.Env]: Cloudflare.Env[Key] extends string
    ? string
    : Cloudflare.Env[Key];
} & {
  CMS_GITHUB_TOKEN?: string;
  CLOUDFLARE_ANALYTICS_TOKEN?: string;
  CLOUDFLARE_BUILD_TOKEN?: string;
};
export async function authenticate(
  request: Request,
  env: Pick<
    CmsEnv,
    "CMS_ACCESS_TEAM_DOMAIN" | "CMS_ACCESS_AUD" | "CMS_ALLOWED_EMAILS"
  >,
) {
  if (
    !env.CMS_ACCESS_TEAM_DOMAIN ||
    !env.CMS_ACCESS_AUD ||
    !env.CMS_ALLOWED_EMAILS
  )
    throw new CmsError(503, "CMS 尚未配置 Cloudflare Access，管理接口已锁定");
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.CMS_ACCESS_TEAM_DOMAIN))
    throw new CmsError(503, "Access 团队域名不合法");
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new CmsError(401, "请先通过 Cloudflare Access 登录");
  try {
    const issuer = `https://${env.CMS_ACCESS_TEAM_DOMAIN}`;
    const { payload } = await jwtVerify(
      token,
      createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)),
      { issuer, audience: env.CMS_ACCESS_AUD, algorithms: ["RS256"] },
    );
    const allowed = env.CMS_ALLOWED_EMAILS.split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    if (
      typeof payload.email !== "string" ||
      !allowed.includes(payload.email.toLowerCase())
    )
      throw new Error("not allowed");
    return payload.email;
  } catch {
    throw new CmsError(403, "登录凭据无效或此账户没有管理权限");
  }
}
function createBackend(env: CmsEnv, user: string): Backend {
  const repository = new GitHubRepository(
    env.CMS_GITHUB_TOKEN || "",
    env.CMS_GITHUB_REPO,
    env.CMS_GITHUB_BRANCH,
  );
  const store = new SqlStore({
    async query<T>(sql: string, values = []) {
      const result = await env.CMS_DB.prepare(sql)
        .bind(...values)
        .all<T>();
      return result.results;
    },
    async execute(sql: string, values = []) {
      const result = await env.CMS_DB.prepare(sql)
        .bind(...values)
        .run();
      return result.meta.changes;
    },
  });
  const stats = {
    token: env.CLOUDFLARE_ANALYTICS_TOKEN,
    buildToken: env.CLOUDFLARE_BUILD_TOKEN,
    accountId: env.CMS_CF_ACCOUNT_ID,
    siteTag: env.CMS_CF_SITE_TAG,
    workerName: env.CMS_CF_WORKER_NAME,
    siteUrl: env.CMS_SITE_URL,
  };
  return {
    repository,
    store,
    session: {
      mode: "cloudflare",
      user,
      siteUrl: env.CMS_SITE_URL,
      integrations: [
        {
          name: "内容源",
          ready: Boolean(env.CMS_GITHUB_TOKEN),
          detail: `${env.CMS_GITHUB_REPO} · ${env.CMS_GITHUB_BRANCH}`,
        },
        {
          name: "草稿与版本",
          ready: Boolean(env.CMS_DB),
          detail: "Cloudflare D1 私有存储",
        },
        {
          name: "媒体库",
          ready: Boolean(env.CMS_MEDIA),
          detail: "Cloudflare R2 · blog/cms/images",
        },
        {
          name: "访问统计",
          ready: Boolean(stats.token && stats.siteTag),
          detail: "Cloudflare Web Analytics + Workers Metrics",
        },
        {
          name: "后台保护",
          ready: true,
          detail: "Access JWT 验签与邮箱白名单",
        },
      ],
    },
    async upload(file) {
      const image = await imageFile(file);
      const id = crypto.randomUUID();
      const key = `blog/cms/images/${id}.${image.extension}`;
      await env.CMS_MEDIA.put(key, image.bytes, {
        httpMetadata: {
          contentType: image.type,
          cacheControl: "public, max-age=31536000, immutable",
        },
      });
      return {
        id,
        name: file.name,
        url: `${env.CMS_MEDIA_URL.replace(/\/$/, "")}/${key}`,
        type: image.type,
        size: file.size,
        createdAt: new Date().toISOString(),
      };
    },
    analytics: (days) => cloudflareAnalytics(stats, days),
    async reconcile(job) {
      let current = job;
      if (!job.commit) {
        try {
          const commit = await repository.findJobCommit(job.path, job.id);
          if (!commit)
            return {
              ...job,
              message:
                "尚未找到对应的 GitHub 提交。请检查仓库记录后刷新；后台不会自动重复提交。",
            };
          const entry = await repository.get(job.path, commit);
          if (!entry || entry.source !== job.source)
            return {
              ...job,
              message: "提交内容与发布快照不一致，请检查仓库记录",
            };
          current = {
            ...job,
            commit,
            status: "building",
            updatedAt: new Date().toISOString(),
          };
        } catch (error) {
          return {
            ...job,
            message: `提交结果待确认：${error instanceof Error ? error.message : "查询失败"}`,
          };
        }
      }
      return reconcileCloudflare(current, stats, (ancestor, deployed) =>
        repository.containsCommit(ancestor, deployed),
      );
    },
  };
}
export default {
  async fetch(request: Request, env: CmsEnv): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/")
      return Response.redirect(new URL("/admin/", request.url), 302);
    if (!(path === "/admin" || path.startsWith("/admin/")))
      return env.ASSETS.fetch(request);
    try {
      const user = await authenticate(request, env);
      if (path.startsWith("/admin/api/"))
        return handleApi(request, createBackend(env, user));
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "no-store");
      headers.set("X-Robots-Tag", "noindex, nofollow");
      headers.set("X-Frame-Options", "DENY");
      headers.set("Referrer-Policy", "same-origin");
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      if (error instanceof CmsError)
        return json({ error: error.message }, error.status);
      console.error(
        JSON.stringify({ event: "cms.worker.failed", message: String(error) }),
      );
      return json({ error: "CMS 服务异常" }, 500);
    }
  },
};
