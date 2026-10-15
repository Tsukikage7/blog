export const COLLECTIONS = {
  blog: "文章",
  writings: "创作",
  notes: "笔记",
  series: "合集",
  about: "关于与简历",
  home: "首页",
  categories: "分类",
  tags: "标签",
  social: "社交链接",
  search: "搜索设置",
  terms: "使用条款",
} as const;
export type Collection = keyof typeof COLLECTIONS;
export type Metadata = Record<string, unknown>;
export type Entry = {
  path: string;
  sha: string | null;
  source: string;
  data: Metadata;
  body: string;
  href: string;
  error?: string;
};
export type Draft = {
  path: string;
  source: string;
  baseSha: string | null;
  revision: number;
  savedAt: string;
};
export type Revision = Draft & { id: number };
export type PublishStatus =
  "committing" | "building" | "live" | "local" | "failed";
export type PublishJob = {
  id: string;
  path: string;
  source: string;
  baseSha: string | null;
  digest: string;
  commit: string | null;
  status: PublishStatus;
  message: string;
  createdAt: string;
  updatedAt: string;
  actor: string;
};
export type Media = {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  createdAt: string;
};
export type Integration = { name: string; ready: boolean; detail: string };
export type Session = {
  mode: "local" | "cloudflare";
  user: string;
  integrations: Integration[];
  siteUrl: string;
};
export type MetricGroup = { name: string; views: number; visits: number };
export type Traffic = {
  views: number;
  visits: number;
  days: MetricGroup[];
  countries: MetricGroup[];
  pages: MetricGroup[];
  referrers: MetricGroup[];
  devices: MetricGroup[];
};
export type WorkersMetrics = { requests: number; errors: number };
export type MetricResult<T> = {
  status: "ready" | "unconfigured" | "error";
  data: T | null;
  message: string;
};
export type Analytics = {
  days: number;
  start: string;
  end: string;
  traffic: MetricResult<Traffic>;
  workers: MetricResult<WorkersMetrics>;
};
export class CmsError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export interface Repository {
  list(): Promise<Entry[]>;
  get(path: string): Promise<Entry | null>;
  publish(
    path: string,
    source: string,
    baseSha: string | null,
    jobId: string,
  ): Promise<string | null>;
}
export interface Store {
  drafts(): Promise<Draft[]>;
  draft(path: string): Promise<Draft | null>;
  saveDraft(
    draft: Omit<Draft, "revision" | "savedAt">,
    expectedRevision: number,
    actor: string,
  ): Promise<Draft>;
  discard(path: string, expectedRevision: number): Promise<void>;
  revisions(path: string): Promise<Revision[]>;
  revision(path: string, id: number): Promise<Revision | null>;
  jobs(): Promise<PublishJob[]>;
  job(id: string): Promise<PublishJob | null>;
  saveJob(job: PublishJob): Promise<void>;
  media(): Promise<Media[]>;
  saveMedia(media: Media): Promise<void>;
}
export interface Backend {
  repository: Repository;
  store: Store;
  session: Session;
  upload(file: File): Promise<Media>;
  analytics(days: number): Promise<Analytics>;
  reconcile(job: PublishJob): Promise<PublishJob>;
}
