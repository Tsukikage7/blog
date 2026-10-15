CREATE TABLE IF NOT EXISTS cms_drafts (
  path TEXT PRIMARY KEY, source TEXT NOT NULL, base_sha TEXT,
  revision INTEGER NOT NULL, saved_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cms_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, source TEXT NOT NULL,
  base_sha TEXT, revision INTEGER NOT NULL, saved_at TEXT NOT NULL, actor TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cms_revisions_path ON cms_revisions(path, id DESC);
CREATE TABLE IF NOT EXISTS cms_jobs (
  id TEXT PRIMARY KEY, path TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS cms_job_active ON cms_jobs(path) WHERE status IN ('committing', 'building');
CREATE TABLE IF NOT EXISTS cms_media (
  id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL
);
