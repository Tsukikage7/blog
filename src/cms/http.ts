import { CmsError, type Backend, type PublishJob } from "./types";
import {
  contentPath,
  digest,
  MAX_SOURCE_BYTES,
  validateSource,
  validateSeries,
  splitSource,
} from "./content";

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
export function checkRequest(request: Request) {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (
    (origin && origin !== url.origin) ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  )
    throw new CmsError(403, "不接受跨站请求");
  if (
    !["GET", "HEAD"].includes(request.method) &&
    request.headers.get("X-CMS-Request") !== "1"
  )
    throw new CmsError(403, "请求缺少 CMS 校验头");
}
async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("Content-Type")?.startsWith("application/json"))
    throw new CmsError(415, "需要 JSON 请求");
  const reader = request.body?.getReader();
  if (!reader) throw new CmsError(400, "请求体为空");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.length;
    if (size > MAX_SOURCE_BYTES + 10000) {
      await reader.cancel();
      throw new CmsError(413, "请求内容过大");
    }
    chunks.push(next.value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const value = JSON.parse(new TextDecoder().decode(all));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new CmsError(400, "JSON 格式错误");
  }
}
function revisionNumber(value: unknown) {
  if (!Number.isInteger(value) || Number(value) < 0)
    throw new CmsError(400, "草稿版本号无效");
  return Number(value);
}
export async function handleApi(
  request: Request,
  backend: Backend,
): Promise<Response> {
  try {
    checkRequest(request);
    const url = new URL(request.url);
    const route = url.pathname.replace(/^\/admin\/api/, "").replace(/\/$/, "");
    const { repository, store, session } = backend;
    if (route === "/session" && request.method === "GET") return json(session);
    if (route === "/entries" && request.method === "GET") {
      const [entries, drafts] = await Promise.all([
        repository.list(),
        store.drafts(),
      ]);
      return json({
        entries: entries.map(
          ({ source: _source, body: _body, ...entry }) => entry,
        ),
        drafts: drafts.map(({ source, ...draft }) => ({
          ...draft,
          data: splitSource(source).data,
        })),
      });
    }
    if (route === "/entry" && request.method === "GET") {
      const path = contentPath(url.searchParams.get("path"));
      const [entry, draft, revisions] = await Promise.all([
        repository.get(path),
        store.draft(path),
        store.revisions(path),
      ]);
      return json({ entry, draft, revisions });
    }
    if (route === "/revision" && request.method === "GET") {
      const path = contentPath(url.searchParams.get("path"));
      const id = revisionNumber(Number(url.searchParams.get("id")));
      const revision = await store.revision(path, id);
      if (!revision) throw new CmsError(404, "草稿历史版本不存在");
      return json(revision);
    }
    if (route === "/draft" && request.method === "PUT") {
      const input = await readJson(request);
      const path = contentPath(input.path);
      if (typeof input.source !== "string")
        throw new CmsError(400, "source 必须为文本");
      validateSource(path, input.source);
      const expected = revisionNumber(input.revision);
      const current = await store.draft(path);
      const entry = current ? null : await repository.get(path);
      const baseSha = current ? current.baseSha : (entry?.sha ?? null);
      if (!current && input.baseSha !== baseSha)
        throw new CmsError(409, "文章源文件已变化，请重新载入");
      return json(
        await store.saveDraft(
          { path, source: input.source, baseSha },
          expected,
          session.user,
        ),
      );
    }
    if (route === "/draft" && request.method === "DELETE") {
      const input = await readJson(request);
      const path = contentPath(input.path);
      await store.discard(path, revisionNumber(input.revision));
      return json({ ok: true });
    }
    if (route === "/publish" && request.method === "POST") {
      const input = await readJson(request);
      const path = contentPath(input.path);
      const draft = await store.draft(path);
      if (!draft || draft.revision !== revisionNumber(input.revision))
        throw new CmsError(409, "请先保存最新草稿");
      const entries = await repository.list();
      const metadata = validateSeries(path, draft.source, entries);
      if (metadata.draft === true)
        throw new CmsError(422, "请关闭文章的 draft 字段后再发布");
      const now = new Date().toISOString();
      const job: PublishJob = {
        id: crypto.randomUUID(),
        path,
        source: draft.source,
        baseSha: draft.baseSha,
        digest: await digest(draft.source),
        commit: null,
        status: "committing",
        message: "正在提交内容",
        createdAt: now,
        updatedAt: now,
        actor: session.user,
      };
      await store.saveJob(job);
      try {
        job.commit = await repository.publish(
          path,
          draft.source,
          draft.baseSha,
          job.id,
        );
        job.status = session.mode === "local" ? "local" : "building";
        job.message =
          session.mode === "local"
            ? "已应用到本地文件，尚未发布到线上"
            : "GitHub 已提交，等待 Cloudflare 构建和网站版本确认";
        job.updatedAt = new Date().toISOString();
        await store.saveJob(job);
        // 新保存的草稿不会被这个任务清除。
        const latest = await store.draft(path);
        if (latest?.revision === draft.revision)
          await store.discard(path, draft.revision);
        return json({ ...job, source: undefined }, 202);
      } catch (error) {
        // 已完成提交后的存储故障不能误报为“提交失败”。
        if (!job.commit && job.status === "committing") {
          job.status =
            session.mode === "local" ||
            (error instanceof CmsError &&
              [400, 401, 403, 404, 409, 422, 503].includes(error.status))
              ? "failed"
              : "committing";
          job.message = error instanceof Error ? error.message : "发布失败";
          job.updatedAt = new Date().toISOString();
          await store.saveJob(job);
        }
        throw error;
      }
    }
    if (route === "/jobs" && request.method === "GET")
      return json(
        (await store.jobs()).map(({ source: _source, ...job }) => job),
      );
    if (route === "/jobs/restore" && request.method === "POST") {
      const input = await readJson(request);
      if (typeof input.id !== "string")
        throw new CmsError(400, "发布记录标识无效");
      const job = await store.job(input.id);
      if (!job) throw new CmsError(404, "发布记录不存在");
      if (["building", "committing"].includes(job.status))
        throw new CmsError(409, "发布尚在进行，请先核对发布状态");
      if (await store.draft(job.path))
        throw new CmsError(409, "这篇内容已有草稿，请先保存或处理现有草稿");
      const entry = await repository.get(job.path);
      const source = job.source;
      return json(
        await store.saveDraft(
          { path: job.path, source, baseSha: entry?.sha ?? null },
          0,
          session.user,
        ),
      );
    }
    if (route === "/jobs/refresh" && request.method === "POST") {
      const jobs = await store.jobs();
      const refreshed: PublishJob[] = [];
      for (const job of jobs) {
        if (["building", "committing"].includes(job.status)) {
          const next = await backend.reconcile(job);
          await store.saveJob(next);
          refreshed.push(next);
        } else refreshed.push(job);
      }
      return json(refreshed.map(({ source: _source, ...job }) => job));
    }
    if (route === "/media" && request.method === "GET")
      return json(await store.media());
    if (route === "/media" && request.method === "POST") {
      // 前端以原始文件上传，先限流读取，避免 multipart 在限制前分配大内存。
      const length = Number(request.headers.get("Content-Length") || 0);
      if (length > 8 * 1024 * 1024) throw new CmsError(413, "图片最大为 8 MiB");
      const reader = request.body?.getReader();
      if (!reader) throw new CmsError(400, "缺少图片");
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let bytes = 0;
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        bytes += next.value.byteLength;
        if (bytes > 8 * 1024 * 1024) {
          await reader.cancel();
          throw new CmsError(413, "图片最大为 8 MiB");
        }
        chunks.push(new Uint8Array(next.value));
      }
      let name: string;
      try {
        name = decodeURIComponent(
          request.headers.get("X-File-Name") || "image",
        );
      } catch {
        throw new CmsError(400, "文件名编码错误");
      }
      const media = await backend.upload(
        new File(chunks, name.slice(0, 200), {
          type:
            request.headers.get("Content-Type") || "application/octet-stream",
        }),
      );
      await store.saveMedia(media);
      return json(media, 201);
    }
    if (route === "/analytics" && request.method === "GET") {
      const days = Number(url.searchParams.get("days") || 7);
      if (![7, 14, 30].includes(days))
        throw new CmsError(400, "统计范围只能为 7、14 或 30 天");
      return json(await backend.analytics(days));
    }
    throw new CmsError(404, "接口不存在");
  } catch (error) {
    if (error instanceof CmsError)
      return json({ error: error.message }, error.status);
    console.error(
      JSON.stringify({
        event: "cms.request.failed",
        message: error instanceof Error ? error.message : String(error),
      }),
    );
    return json({ error: "服务暂时不可用，请检查服务日志后重试" }, 500);
  }
}
