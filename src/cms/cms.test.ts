import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalBackend } from "./local";
import { handleApi } from "./http";
import {
  entryFromSource,
  patchMetadata,
  validateSource,
  validateSeries,
  contentPath,
} from "./content";
import { authenticate } from "./worker";
import { GitHubRepository } from "./github";
import { cloudflareAnalytics, reconcileCloudflare } from "./cloudflare";
import { CmsError, type Draft, type PublishJob } from "./types";

const path = "src/content/writings/sample.md";
const original =
  "---\ntitle: 午后\ncreated: 2026-10-09\ngenre: 随笔\ndraft: false\ncustom: keep-me\n---\n\n旧正文。\n";
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "blog-cms-"));
  await mkdir(join(root, "src/content/writings"), { recursive: true });
  await cp(
    new URL("../../migrations/cms", import.meta.url),
    join(root, "migrations/cms"),
    { recursive: true },
  );
  await writeFile(join(root, path), original);
  const local = await createLocalBackend(root);
  return {
    root,
    ...local,
    async cleanup() {
      local.close();
      await rm(root, { recursive: true, force: true });
    },
  };
}
function request(
  route: string,
  method = "GET",
  input?: unknown,
  extra: Record<string, string> = {},
) {
  return new Request(`http://localhost/admin/api${route}`, {
    method,
    headers: {
      "X-CMS-Request": "1",
      "Content-Type": "application/json",
      ...extra,
    },
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
}
test("common field editing preserves YAML comments, unknown fields and exact MDX body", () => {
  const source =
    original.replace("custom: keep-me", "# 私有扩展字段\ncustom: keep-me") +
    "\n<Notice>不要丢掉组件</Notice>\n";
  const result = patchMetadata(source, { title: "更改标题" });
  assert.ok(result.includes("# 私有扩展字段"));
  assert.ok(result.includes("custom: keep-me"));
  assert.equal(
    entryFromSource(path, result, null).body,
    entryFromSource(path, source, null).body,
  );
  assert.throws(
    () =>
      validateSource(
        "src/content/about/-index.md",
        original.replace(
          "custom: keep-me",
          "experience:\n  - title: missing-required-fields",
        ),
      ),
    CmsError,
  );
});
test("draft persistence, optimistic concurrency and non-reused revisions after discard", async () => {
  const f = await fixture();
  try {
    const first = await f.backend.store.saveDraft(
      { path, source: original, baseSha: null },
      0,
      "owner",
    );
    const second = await f.backend.store.saveDraft(
      { path, source: original + "第二版", baseSha: null },
      first.revision,
      "owner",
    );
    await assert.rejects(
      f.backend.store.saveDraft(
        { path, source: "旧窗口", baseSha: null },
        first.revision,
        "owner",
      ),
      /另一窗口/,
    );
    await assert.rejects(
      f.backend.store.saveDraft(
        { path, source: "重复首次保存", baseSha: null },
        0,
        "owner",
      ),
      /另一窗口/,
    );
    await f.backend.store.discard(path, second.revision);
    const third = await f.backend.store.saveDraft(
      { path, source: original, baseSha: null },
      0,
      "owner",
    );
    assert.ok(third.revision > second.revision);
    await assert.rejects(
      f.backend.store.saveDraft(
        { path, source: "ABA stale write", baseSha: null },
        first.revision,
        "owner",
      ),
      /另一窗口/,
    );
    assert.equal(await readFile(join(f.root, path), "utf8"), original);
    const restart = await createLocalBackend(f.root);
    assert.equal((await restart.backend.store.draft(path))?.source, original);
    assert.equal((await restart.backend.store.revisions(path)).length, 3);
    restart.close();
  } finally {
    await f.cleanup();
  }
});
test("local API saves separately, applies content and retains a recoverable publish snapshot", async () => {
  const f = await fixture();
  try {
    const entry = await f.backend.repository.get(path);
    const source = original.replace("旧正文", "新正文");
    const save = await handleApi(
      request("/draft", "PUT", {
        path,
        source,
        baseSha: entry!.sha,
        revision: 0,
      }),
      f.backend,
    );
    assert.equal(save.status, 200);
    const draft = (await save.json()) as Draft;
    assert.equal(await readFile(join(f.root, path), "utf8"), original);
    const published = await handleApi(
      request("/publish", "POST", { path, revision: draft.revision }),
      f.backend,
    );
    assert.equal(published.status, 202);
    const job = (await published.json()) as PublishJob;
    assert.equal(job.status, "local");
    assert.equal(await readFile(join(f.root, path), "utf8"), source);
    assert.equal(await f.backend.store.draft(path), null);
    assert.equal((await f.backend.store.job(job.id))?.source, source);
    const restored = await handleApi(
      request("/jobs/restore", "POST", { id: job.id }),
      f.backend,
    );
    assert.equal(restored.status, 200);
    const duplicate = await handleApi(
      request("/jobs/restore", "POST", { id: job.id }),
      f.backend,
    );
    assert.equal(duplicate.status, 409);
  } finally {
    await f.cleanup();
  }
});
test("external file changes block publishing and leave draft and failure evidence intact", async () => {
  const f = await fixture();
  try {
    const entry = await f.backend.repository.get(path);
    const draft = await f.backend.store.saveDraft(
      { path, source: original + "草稿", baseSha: entry!.sha },
      0,
      "owner",
    );
    await writeFile(join(f.root, path), original + "编辑器中的新版本");
    const result = await handleApi(
      request("/publish", "POST", { path, revision: draft.revision }),
      f.backend,
    );
    assert.equal(result.status, 409);
    assert.equal(
      (await f.backend.store.draft(path))?.source,
      original + "草稿",
    );
    assert.equal((await f.backend.store.jobs())[0].status, "failed");
    assert.ok(
      (await readFile(join(f.root, path), "utf8")).endsWith("编辑器中的新版本"),
    );
  } finally {
    await f.cleanup();
  }
});
test("publishing an older snapshot does not discard a newer concurrently saved draft", async () => {
  const f = await fixture();
  try {
    const entry = await f.backend.repository.get(path);
    const saved = await f.backend.store.saveDraft(
      { path, source: original, baseSha: entry!.sha },
      0,
      "owner",
    );
    const originalPublish = f.backend.repository.publish.bind(
      f.backend.repository,
    );
    f.backend.repository.publish = async (...args) => {
      await f.backend.store.saveDraft(
        { path, source: original + "继续写", baseSha: entry!.sha },
        saved.revision,
        "owner",
      );
      return originalPublish(...args);
    };
    const result = await handleApi(
      request("/publish", "POST", { path, revision: saved.revision }),
      f.backend,
    );
    assert.equal(result.status, 202);
    assert.ok((await f.backend.store.draft(path))?.source.endsWith("继续写"));
  } finally {
    await f.cleanup();
  }
});
test("cross-site writes, path traversal, symbolic links and fake image uploads are rejected", async () => {
  const f = await fixture();
  try {
    const csrf = await handleApi(
      request(
        "/draft",
        "PUT",
        { path, source: original, revision: 0, baseSha: null },
        { Origin: "https://evil.example" },
      ),
      f.backend,
    );
    assert.equal(csrf.status, 403);
    assert.throws(
      () => contentPath("src/content/writings/../../package.json"),
      CmsError,
    );
    const outside = await mkdtemp(join(tmpdir(), "cms-outside-"));
    try {
      await symlink(outside, join(f.root, "src/content/writings/link"));
      await assert.rejects(
        f.backend.repository.get("src/content/writings/link/new/file.md"),
        /符号链接/,
      );
      await assert.rejects(readFile(join(outside, "new/file.md")), /ENOENT/);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
    const fake = await handleApi(
      new Request("http://localhost/admin/api/media", {
        method: "POST",
        headers: { "X-CMS-Request": "1", "Content-Type": "image/png" },
        body: "<svg onload=alert(1)>",
      }),
      f.backend,
    );
    assert.equal(fake.status, 415);
  } finally {
    await f.cleanup();
  }
});
test("collection and chapter validation uses the real blog schema and rejects duplicates", () => {
  assert.throws(
    () => validateSource("src/content/blog/test.md", original),
    /categories/,
  );
  const definition = entryFromSource(
    "src/content/series/test.md",
    "---\ntitle: 合集\ndescription: 测试\nkind: literary\n---\n",
    null,
  );
  const chapter = patchMetadata(original, { series: "test", seriesOrder: 1 });
  validateSeries(path, chapter, [definition]);
  assert.throws(
    () =>
      validateSeries("src/content/writings/another.md", chapter, [
        definition,
        entryFromSource(path, chapter, null),
      ]),
    /重复/,
  );
  assert.throws(() => validateSeries(path, chapter, []), /不存在/);
});
test("Access fails closed when unconfigured or presented with a forged assertion", async () => {
  await assert.rejects(
    authenticate(request("/session"), {
      CMS_ACCESS_TEAM_DOMAIN: "",
      CMS_ACCESS_AUD: "",
      CMS_ALLOWED_EMAILS: "",
    }),
    /锁定/,
  );
  await assert.rejects(
    authenticate(request("/session"), {
      CMS_ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
      CMS_ACCESS_AUD: "aud",
      CMS_ALLOWED_EMAILS: "owner@example.com",
    }),
    /登录/,
  );
  await assert.rejects(
    authenticate(
      request("/session", "GET", undefined, {
        "Cf-Access-Jwt-Assertion": "forged.jwt.value",
      }),
      {
        CMS_ACCESS_TEAM_DOMAIN: "example.cloudflareaccess.com",
        CMS_ACCESS_AUD: "aud",
        CMS_ALLOWED_EMAILS: "owner@example.com",
      },
    ),
    /无效/,
  );
});
test("GitHub default fetch does not bind the repository as its runtime receiver", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function (this: unknown) {
    assert.equal(this, undefined);
    return Response.json({
      content: Buffer.from(original).toString("base64"),
      encoding: "base64",
      sha: "blob",
      size: Buffer.byteLength(original),
    });
  };
  try {
    const repo = new GitHubRepository("test-token", "owner/blog", "main");
    assert.equal((await repo.get(path))?.source, original);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub publishing validates snapshots and protects concurrent branch updates", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  let rejectRef = false;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    if (rejectRef && init?.method === "PATCH")
      return new Response("conflict", { status: 422 });
    const data = url.includes("git/ref/heads/")
      ? { object: { sha: "head-one" } }
      : url.includes("git/commits/head-one")
        ? { tree: { sha: "tree-one" } }
        : url.includes("contents/")
          ? {
              content: Buffer.from(original).toString("base64"),
              encoding: "base64",
              sha: "blob-one",
              size: Buffer.byteLength(original),
            }
          : url.endsWith("git/blobs")
            ? { sha: "new-blob" }
            : url.endsWith("git/trees")
              ? { sha: "new-tree" }
              : { sha: "new-commit" };
    return new Response(JSON.stringify(data), { status: 200 });
  };
  const repo = new GitHubRepository(
    "private-token",
    "owner/blog",
    "main",
    fetcher,
  );
  await assert.rejects(
    repo.publish(path, original, "old-blob", "job"),
    /已被修改/,
  );
  assert.equal(
    calls.some((call) => call.init?.method === "POST"),
    false,
  );
  assert.equal(
    await repo.publish(path, original, "blob-one", "job"),
    "new-commit",
  );
  const body = (suffix: string) =>
    JSON.parse(
      String(
        calls.find(
          (call) => call.url.endsWith(suffix) && call.init?.method === "POST",
        )!.init!.body,
      ),
    );
  assert.equal(body("git/blobs").content, original);
  assert.equal(body("git/blobs").encoding, "utf-8");
  assert.equal(body("git/trees").base_tree, "tree-one");
  assert.deepEqual(body("git/commits").parents, ["head-one"]);
  assert.deepEqual(JSON.parse(String(calls.at(-1)!.init!.body)), {
    sha: "new-commit",
    force: false,
  });
  rejectRef = true;
  await assert.rejects(
    repo.publish(path, original, "blob-one", "another-job"),
    /已变化/,
  );
});
test("unknown remote submission outcomes retain a draft and prevent duplicate submissions", async () => {
  const f = await fixture();
  try {
    f.backend.session.mode = "cloudflare";
    let submissions = 0;
    f.backend.repository.publish = async () => {
      submissions += 1;
      throw new Error("network response lost");
    };
    const entry = await f.backend.repository.get(path);
    const draft = await f.backend.store.saveDraft(
      { path, source: original, baseSha: entry!.sha },
      0,
      "owner",
    );
    assert.equal(
      (
        await handleApi(
          request("/publish", "POST", { path, revision: draft.revision }),
          f.backend,
        )
      ).status,
      500,
    );
    assert.equal((await f.backend.store.jobs())[0].status, "committing");
    assert.ok(await f.backend.store.draft(path));
    assert.equal(
      (
        await handleApi(
          request("/publish", "POST", { path, revision: draft.revision }),
          f.backend,
        )
      ).status,
      409,
    );
    assert.equal(submissions, 1);
  } finally {
    await f.cleanup();
  }
});
test("unconfigured analytics is unknown, and GraphQL HTTP 200 errors are surfaced", async () => {
  const unconfigured = await cloudflareAnalytics(
    { siteUrl: "https://example.com" },
    7,
  );
  assert.equal(unconfigured.traffic.data, null);
  assert.equal(unconfigured.workers.status, "unconfigured");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ errors: [{ message: "permission denied" }] }),
      { status: 200 },
    );
  try {
    const result = await cloudflareAnalytics(
      {
        token: "test",
        accountId: "account",
        siteTag: "site",
        workerName: "blog",
        siteUrl: "https://example.com",
      },
      7,
    );
    assert.equal(result.traffic.status, "error");
    assert.match(result.traffic.message, /permission denied/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
test("a successful build alone cannot mark a publish live without matching site content", async () => {
  const originalFetch = globalThis.fetch;
  const job: PublishJob = {
    id: "job",
    path,
    source: original,
    baseSha: null,
    digest: "expected-digest",
    commit: "expected-commit",
    status: "building",
    message: "",
    actor: "owner",
    createdAt: "",
    updatedAt: "",
  };
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        commit: "another-commit",
        files: { [path]: "expected-digest" },
      }),
      { status: 200 },
    );
  try {
    assert.equal(
      (await reconcileCloudflare(job, { siteUrl: "https://example.com" }))
        .status,
      "building",
    );
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ commit: job.commit, files: { [path]: job.digest } }),
        { status: 200 },
      );
    assert.equal(
      (await reconcileCloudflare(job, { siteUrl: "https://example.com" }))
        .status,
      "live",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
