import { contentPath, entryFromSource, MAX_SOURCE_BYTES } from "./content";
import { CmsError, type Repository } from "./types";
import { providerJson } from "./provider";
export class GitHubRepository implements Repository {
  private snapshot: { commit: string; tree: string } | null = null;
  constructor(
    private token: string,
    private repo: string,
    private branch: string,
    // 包装全局 fetch，避免 Workers 把仓库实例当作运行时函数的 this。
    private fetcher: typeof fetch = (...args) => fetch(...args),
  ) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo))
      throw new CmsError(503, "GitHub 仓库配置不合法");
  }
  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.token) throw new CmsError(503, "CMS_GITHUB_TOKEN 尚未配置");
    const response = await this.fetcher(
      `https://api.github.com/repos/${this.repo}/${path}`,
      {
        ...init,
        signal: AbortSignal.timeout(20000),
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "Tsukikage-Blog-CMS",
          "Content-Type": "application/json",
          ...init.headers,
        },
      },
    );
    if (!response.ok) {
      if ([400, 401, 403].includes(response.status))
        throw new CmsError(
          response.status,
          `GitHub 请求被拒绝（${response.status}），请检查仓库权限或限额`,
        );
      if (response.status === 404)
        throw new CmsError(404, "GitHub 内容或仓库不存在");
      if ([409, 422].includes(response.status))
        throw new CmsError(409, "GitHub 内容已变化，请重新载入并合并修改");
      throw new CmsError(
        502,
        `GitHub 请求失败（${response.status}），请检查仓库权限或限额`,
      );
    }
    return providerJson<T>(response);
  }
  async get(path: string, ref = this.branch) {
    contentPath(path);
    try {
      const data = await this.call<{
        content: string;
        encoding: string;
        sha: string;
        size: number;
      }>(`contents/${path}?ref=${encodeURIComponent(ref)}`);
      if (data.size > MAX_SOURCE_BYTES || data.encoding !== "base64")
        throw new CmsError(413, "文件超过编辑上限");
      const raw = atob(data.content.replace(/\s/g, ""));
      const source = new TextDecoder().decode(
        Uint8Array.from(raw, (character) => character.charCodeAt(0)),
      );
      return entryFromSource(path, source, data.sha);
    } catch (error) {
      if (error instanceof CmsError && error.status === 404) return null;
      throw error;
    }
  }
  async list() {
    const head = await this.call<{ object: { sha: string } }>(
      `git/ref/heads/${encodeURIComponent(this.branch)}`,
    );
    const tree = await this.call<{
      sha: string;
      truncated: boolean;
      tree: { path: string; type: string }[];
    }>(`git/trees/${head.object.sha}?recursive=1`);
    this.snapshot = { commit: head.object.sha, tree: tree.sha };
    if (tree.truncated)
      throw new CmsError(502, "GitHub 目录结果不完整，无法安全列出内容");
    const paths = tree.tree
      .filter(
        (item) =>
          item.type === "blob" &&
          item.path.startsWith("src/content/") &&
          /\.mdx?$/.test(item.path),
      )
      .map((item) => item.path)
      .filter((path) => {
        try {
          contentPath(path);
          return true;
        } catch {
          return false;
        }
      });
    const entries = [];
    for (let index = 0; index < paths.length; index += 6) {
      const batch = await Promise.all(
        paths
          .slice(index, index + 6)
          .map((path) => this.get(path, head.object.sha)),
      );
      entries.push(...batch.filter((entry) => entry !== null));
    }
    return entries;
  }
  async publish(
    path: string,
    source: string,
    baseSha: string | null,
    jobId: string,
  ) {
    // 所有合集校验基于一个提交快照，最终以非强制 ref 更新防止覆盖并发提交。
    if (!this.snapshot) {
      const head = await this.call<{ object: { sha: string } }>(
        `git/ref/heads/${encodeURIComponent(this.branch)}`,
      );
      const commit = await this.call<{ tree: { sha: string } }>(
        `git/commits/${head.object.sha}`,
      );
      this.snapshot = { commit: head.object.sha, tree: commit.tree.sha };
    }
    const current = await this.get(path, this.snapshot.commit);
    if ((current?.sha ?? null) !== baseSha)
      throw new CmsError(
        409,
        "GitHub 文件已被修改，发布已中止，请合并最新内容",
      );
    const blob = await this.call<{ sha: string }>("git/blobs", {
      method: "POST",
      body: JSON.stringify({ content: source, encoding: "utf-8" }),
    });
    const tree = await this.call<{ sha: string }>("git/trees", {
      method: "POST",
      body: JSON.stringify({
        base_tree: this.snapshot.tree,
        tree: [
          {
            path: contentPath(path),
            mode: "100644",
            type: "blob",
            sha: blob.sha,
          },
        ],
      }),
    });
    const commit = await this.call<{ sha: string }>("git/commits", {
      method: "POST",
      body: JSON.stringify({
        message: `content: update ${path.split("/").at(-1)} [cms:${jobId}]`,
        tree: tree.sha,
        parents: [this.snapshot.commit],
      }),
    });
    await this.call(`git/refs/heads/${encodeURIComponent(this.branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
    return commit.sha;
  }
  async findJobCommit(path: string, jobId: string) {
    const commits = await this.call<
      { sha: string; commit: { message: string } }[]
    >(
      `commits?sha=${encodeURIComponent(this.branch)}&path=${encodeURIComponent(path)}&per_page=30`,
    );
    return (
      commits.find((item) => item.commit.message.includes(`[cms:${jobId}]`))
        ?.sha ?? null
    );
  }
  async containsCommit(ancestor: string, deployed: string) {
    if (!/^[a-f0-9]{40}$/.test(ancestor) || !/^[a-f0-9]{40}$/.test(deployed))
      return false;
    const result = await this.call<{ status: string }>(
      `compare/${ancestor}...${deployed}`,
    );
    return ["ahead", "identical"].includes(result.status);
  }
}
