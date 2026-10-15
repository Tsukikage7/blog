import {
  CmsError,
  type Draft,
  type PublishJob,
  type Media,
  type Store,
  type Revision,
} from "./types";
export interface SqlDatabase {
  query<T>(sql: string, values?: (string | number | null)[]): Promise<T[]>;
  execute(sql: string, values?: (string | number | null)[]): Promise<number>;
}
type DraftRow = {
  path: string;
  source: string;
  base_sha: string | null;
  revision: number;
  saved_at: string;
  id?: number;
};
const mapDraft = (row: DraftRow): Draft => ({
  path: row.path,
  source: row.source,
  baseSha: row.base_sha,
  revision: row.revision,
  savedAt: row.saved_at,
});
export class SqlStore implements Store {
  constructor(private db: SqlDatabase) {}
  async drafts() {
    return (
      await this.db.query<DraftRow>(
        "SELECT * FROM cms_drafts ORDER BY saved_at DESC",
      )
    ).map(mapDraft);
  }
  async draft(path: string) {
    const rows = await this.db.query<DraftRow>(
      "SELECT * FROM cms_drafts WHERE path = ?",
      [path],
    );
    return rows[0] ? mapDraft(rows[0]) : null;
  }
  async saveDraft(
    input: Omit<Draft, "revision" | "savedAt">,
    expected: number,
    actor: string,
  ) {
    const savedAt = new Date().toISOString();
    const rows =
      expected === 0
        ? await this.db.query<DraftRow>(
            "INSERT INTO cms_drafts(path, source, base_sha, revision, saved_at, actor) SELECT ?, ?, ?, COALESCE(MAX(revision), 0) + 1, ?, ? FROM cms_revisions WHERE path = ? ON CONFLICT(path) DO NOTHING RETURNING *",
            [
              input.path,
              input.source,
              input.baseSha,
              savedAt,
              actor,
              input.path,
            ],
          )
        : await this.db.query<DraftRow>(
            "UPDATE cms_drafts SET source = ?, base_sha = ?, revision = revision + 1, saved_at = ?, actor = ? WHERE path = ? AND revision = ? RETURNING *",
            [input.source, input.baseSha, savedAt, actor, input.path, expected],
          );
    if (!rows.length)
      throw new CmsError(409, "草稿已被另一窗口修改，请重新载入后再保存");
    return mapDraft(rows[0]);
  }
  async discard(path: string, revision: number) {
    if (
      !(await this.db.execute(
        "DELETE FROM cms_drafts WHERE path = ? AND revision = ?",
        [path, revision],
      ))
    )
      throw new CmsError(409, "草稿版本已变化，请重新载入");
  }
  async revisions(path: string): Promise<Revision[]> {
    return (
      await this.db.query<DraftRow>(
        "SELECT id, path, base_sha, revision, saved_at, '' AS source FROM cms_revisions WHERE path = ? ORDER BY id DESC LIMIT 30",
        [path],
      )
    ).map((row) => ({ ...mapDraft(row), id: row.id! }));
  }
  async revision(path: string, id: number): Promise<Revision | null> {
    const rows = await this.db.query<DraftRow>(
      "SELECT * FROM cms_revisions WHERE path = ? AND id = ?",
      [path, id],
    );
    return rows[0] ? { ...mapDraft(rows[0]), id: rows[0].id! } : null;
  }
  async jobs() {
    return (
      await this.db.query<{ payload: string }>(
        "SELECT payload FROM cms_jobs ORDER BY created_at DESC LIMIT 100",
      )
    ).map((row) => JSON.parse(row.payload) as PublishJob);
  }
  async job(id: string) {
    const rows = await this.db.query<{ payload: string }>(
      "SELECT payload FROM cms_jobs WHERE id = ?",
      [id],
    );
    return rows[0] ? (JSON.parse(rows[0].payload) as PublishJob) : null;
  }
  async saveJob(job: PublishJob) {
    try {
      await this.db.execute(
        "INSERT INTO cms_jobs(id, path, payload, status, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, status = excluded.status",
        [job.id, job.path, JSON.stringify(job), job.status, job.createdAt],
      );
    } catch (error) {
      if (String(error).includes("UNIQUE"))
        throw new CmsError(409, "这篇内容已有发布任务，请先刷新发布状态");
      throw error;
    }
  }
  async media() {
    return (
      await this.db.query<{ payload: string }>(
        "SELECT payload FROM cms_media ORDER BY created_at DESC LIMIT 100",
      )
    ).map((row) => JSON.parse(row.payload) as Media);
  }
  async saveMedia(media: Media) {
    await this.db.execute(
      "INSERT INTO cms_media(id, payload, created_at) VALUES (?, ?, ?)",
      [media.id, JSON.stringify(media), media.createdAt],
    );
  }
}
