import { DatabaseSync } from "node:sqlite";
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  writeFile,
  lstat,
  unlink,
} from "node:fs/promises";
import { join, resolve, relative, dirname } from "node:path";
import { contentPath, digest, entryFromSource } from "./content";
import { imageFile } from "./media";
import { SqlStore } from "./store";
import {
  CmsError,
  type Backend,
  type Entry,
  type Media,
  type Repository,
} from "./types";
import { cloudflareAnalytics } from "./cloudflare";

async function safeFile(root: string, path: string) {
  const base = await realpath(join(root, "src/content"));
  const file = resolve(root, contentPath(path));
  let current = base;
  for (const part of relative(join(root, "src/content"), file).split("/")) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new CmsError(400, "不允许编辑符号链接");
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        break;
      throw error;
    }
  }
  return file;
}
export class LocalRepository implements Repository {
  constructor(private root: string) {}
  async get(path: string) {
    const file = await safeFile(this.root, path);
    try {
      const source = await readFile(file, "utf8");
      return entryFromSource(path, source, await digest(source));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT")
        return null;
      throw error;
    }
  }
  async list(): Promise<Entry[]> {
    const entries: Entry[] = [];
    const walk = async (directory: string) => {
      for (const file of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, file.name);
        if (file.isDirectory()) await walk(path);
        else if (file.isFile() && /\.mdx?$/.test(file.name)) {
          const relativePath = relative(this.root, path);
          try {
            contentPath(relativePath);
          } catch {
            continue;
          }
          const entry = await this.get(relativePath);
          if (entry) entries.push(entry);
        }
      }
    };
    await walk(join(this.root, "src/content"));
    return entries;
  }
  async publish(
    path: string,
    source: string,
    baseSha: string | null,
    _jobId: string,
  ) {
    const current = await this.get(path);
    if ((current?.sha ?? null) !== baseSha)
      throw new CmsError(409, "本地文件已被编辑器修改，请重新载入并合并内容");
    const file = await safeFile(this.root, path);
    const temp = `${file}.${crypto.randomUUID()}.tmp`;
    await mkdir(dirname(file), { recursive: true });
    try {
      await writeFile(temp, source, { flag: "wx" });
      await rename(temp, file);
    } finally {
      await unlink(temp).catch(() => {});
    }
    return null;
  }
}
export async function createLocalBackend(
  root: string,
  env: Record<string, string> = {},
) {
  await mkdir(join(root, ".cms"), { recursive: true });
  const database = new DatabaseSync(join(root, ".cms/state.sqlite"));
  database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  database.exec(
    "CREATE TABLE IF NOT EXISTS cms_local_migrations(name TEXT PRIMARY KEY)",
  );
  const migrations = join(root, "migrations/cms");
  for (const name of (await readdir(migrations))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    if (
      database
        .prepare("SELECT name FROM cms_local_migrations WHERE name = ?")
        .get(name)
    )
      continue;
    database.exec("BEGIN IMMEDIATE");
    try {
      database.exec(await readFile(join(migrations, name), "utf8"));
      database
        .prepare("INSERT INTO cms_local_migrations(name) VALUES (?)")
        .run(name);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }
  const store = new SqlStore({
    async query<T>(sql: string, values = []) {
      return database.prepare(sql).all(...values) as T[];
    },
    async execute(sql: string, values = []) {
      return Number(database.prepare(sql).run(...values).changes);
    },
  });
  const stats = {
    token: env.CLOUDFLARE_ANALYTICS_TOKEN,
    accountId: env.CMS_CF_ACCOUNT_ID,
    siteTag: env.CMS_CF_SITE_TAG,
    workerName: env.CMS_CF_WORKER_NAME || "blog",
    siteUrl: env.CMS_SITE_URL || "https://tsukikage7.com",
  };
  const backend: Backend = {
    store,
    repository: new LocalRepository(root),
    session: {
      mode: "local",
      user: "本地工作区",
      siteUrl: stats.siteUrl,
      integrations: [
        {
          name: "内容源",
          ready: true,
          detail: "当前工作区 Markdown / MDX；应用修改仅写入本地文件",
        },
        {
          name: "草稿与版本",
          ready: true,
          detail: "SQLite 持久保存于 .cms/state.sqlite",
        },
        {
          name: "媒体库",
          ready: true,
          detail: "图片保存在 public/images/cms，随博客构建发布",
        },
        {
          name: "访问统计",
          ready: Boolean(stats.token && stats.accountId && stats.siteTag),
          detail:
            "需配置 CLOUDFLARE_ANALYTICS_TOKEN、CMS_CF_ACCOUNT_ID、CMS_CF_SITE_TAG",
        },
        {
          name: "线上发布",
          ready: false,
          detail:
            "本地模式不会提交 GitHub；Cloudflare 部署后使用受保护的线上 API",
        },
      ],
    },
    async upload(file) {
      const image = await imageFile(file);
      const id = crypto.randomUUID();
      const directory = join(root, "public/images/cms");
      await mkdir(directory, { recursive: true });
      const name = `${id}.${image.extension}`;
      await writeFile(join(directory, name), image.bytes, { flag: "wx" });
      return {
        id,
        name: file.name,
        url: `/images/cms/${name}`,
        type: image.type,
        size: file.size,
        createdAt: new Date().toISOString(),
      } satisfies Media;
    },
    analytics: (days) => cloudflareAnalytics(stats, days),
    async reconcile(job) {
      return job;
    },
  };
  return { backend, close: () => database.close() };
}
