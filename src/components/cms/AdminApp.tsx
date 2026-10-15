import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Select,
  Table,
  TextField,
  Theme,
} from "@radix-ui/themes";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BarChartIcon,
  DashboardIcon,
  FileTextIcon,
  GearIcon,
  ImageIcon,
  MagnifyingGlassIcon,
  PaperPlaneIcon,
  PlusIcon,
  ReloadIcon,
  ExternalLinkIcon,
  Cross2Icon,
  CheckCircledIcon,
  InfoCircledIcon,
} from "@radix-ui/react-icons";
import {
  COLLECTIONS,
  type Collection,
  type Analytics,
  type Draft,
  type Entry,
  type Media,
  type MetricGroup,
  type PublishJob,
  type Session,
} from "../../cms/types";
import { api, displayDate, formatTime } from "./api";
import Editor from "./Editor";

type ListedEntry = Omit<Entry, "source" | "body">;
type ListedDraft = Omit<Draft, "source"> & { data: Entry["data"] };
type Job = Omit<PublishJob, "source">;
type View =
  "overview" | "content" | "media" | "analytics" | "jobs" | "settings";
const NAV = [
  { id: "overview", label: "工作台", icon: DashboardIcon },
  { id: "content", label: "内容管理", icon: FileTextIcon },
  { id: "media", label: "媒体库", icon: ImageIcon },
  { id: "analytics", label: "访问统计", icon: BarChartIcon },
  { id: "jobs", label: "发布记录", icon: PaperPlaneIcon },
  { id: "settings", label: "连接设置", icon: GearIcon },
] as const;
const JOB_LABELS = {
  committing: "提交中",
  building: "等待上线",
  live: "已上线",
  local: "已应用到本地",
  failed: "发布失败",
} as const;
const singleton = ["about", "home", "social", "search", "terms"];
const countFormat = (value: number) =>
  new Intl.NumberFormat("zh-CN").format(value);

function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="cms-empty">
      <FileTextIcon />
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
function Metric({
  label,
  value,
  caption,
}: {
  label: string;
  value: React.ReactNode;
  caption: string;
}) {
  return (
    <div className="cms-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{caption}</p>
    </div>
  );
}
function Breakdown({
  title,
  rows,
  type = "浏览量",
  emptyMessage = "所选时间内没有采集到数据。",
}: {
  title: string;
  rows: MetricGroup[];
  type?: string;
  emptyMessage?: string;
}) {
  return (
    <section className="cms-panel">
      <div className="cms-panel-heading">
        <h2>{title}</h2>
        <span>{type}</span>
      </div>
      {rows.length ? (
        <Table.Root>
          <Table.Body>
            {rows.slice(0, 10).map((row) => (
              <Table.Row key={row.name}>
                <Table.RowHeaderCell>{row.name}</Table.RowHeaderCell>
                <Table.Cell align="right">{countFormat(row.views)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      ) : (
        <p className="cms-panel-empty">{emptyMessage}</p>
      )}
    </section>
  );
}
function Trend({ rows }: { rows: MetricGroup[] }) {
  if (!rows.length)
    return (
      <Empty
        title="暂无访问趋势"
        description="Cloudflare 接收到浏览器统计数据后，会在这里显示访问趋势。"
      />
    );
  const maximum = Math.max(1, ...rows.map((item) => item.views));
  const points = rows
    .map(
      (row, index) =>
        `${rows.length === 1 ? 350 : 20 + (index / (rows.length - 1)) * 660},${170 - (row.views / maximum) * 135}`,
    )
    .join(" ");
  return (
    <div className="cms-trend">
      <svg viewBox="0 0 700 210" role="img" aria-label="每日浏览量趋势">
        <line x1="20" x2="680" y1="170" y2="170" stroke="var(--gray-5)" />
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent-9)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        {rows.map((row, index) => (
          <g key={row.name}>
            <circle
              cx={
                rows.length === 1 ? 350 : 20 + (index / (rows.length - 1)) * 660
              }
              cy={170 - (row.views / maximum) * 135}
              r="4"
              fill="var(--accent-9)"
            >
              <title>
                {row.name}：{row.views} 次浏览
              </title>
            </circle>
            {(index === 0 || index === rows.length - 1 || rows.length <= 7) && (
              <text
                x={
                  rows.length === 1
                    ? 350
                    : 20 + (index / (rows.length - 1)) * 660
                }
                y="198"
                textAnchor="middle"
                fill="var(--gray-10)"
                fontSize="12"
              >
                {row.name.slice(5)}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function AdminApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>("overview");
  const [entries, setEntries] = useState<ListedEntry[]>([]);
  const [drafts, setDrafts] = useState<ListedDraft[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [days, setDays] = useState(7);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const editorDirty = useRef(false);
  const currentUrl = useRef(location.href);
  const onDirtyChange = useCallback((dirty: boolean) => {
    editorDirty.current = dirty;
  }, []);
  const notify = useCallback(
    (message: string, error = false) => setToast({ message, error }),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(
      () => setToast(null),
      toast.error ? 15000 : 6500,
    );
    return () => window.clearTimeout(timer);
  }, [toast]);
  const reloadContent = useCallback(async () => {
    try {
      const result = await api<{
        entries: ListedEntry[];
        drafts: ListedDraft[];
      }>("/entries");
      setEntries(result.entries);
      setDrafts(result.drafts);
    } catch (error) {
      notify((error as Error).message, true);
    }
  }, [notify]);
  const contentChanged = useCallback(() => {
    void reloadContent();
  }, [reloadContent]);
  const boot = useCallback(async () => {
    setLoading(true);
    setSessionError("");
    try {
      const value = await api<Session>("/session");
      setSession(value);
      await reloadContent();
    } catch (error) {
      setSessionError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }, [reloadContent]);
  useEffect(() => {
    void boot();
  }, [boot]);
  useEffect(() => {
    const restore = (event?: PopStateEvent) => {
      if (
        event &&
        editorDirty.current &&
        !window.confirm("还有尚未保存的修改，确定离开编辑器？")
      ) {
        history.pushState(null, "", currentUrl.current);
        return;
      }
      editorDirty.current = false;
      currentUrl.current = location.href;
      const params = new URLSearchParams(location.search);
      const selected = params.get("view");
      setView(
        NAV.some((item) => item.id === selected)
          ? (selected as View)
          : "overview",
      );
      setEditing(params.get("path"));
      setCreating(params.get("new") === "1");
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  function navigate(next: View, path?: string, create = false) {
    if (
      editorDirty.current &&
      !window.confirm("还有尚未保存的修改，确定离开编辑器？")
    )
      return;
    editorDirty.current = false;
    const params = new URLSearchParams({ view: next });
    if (path) params.set("path", path);
    if (create) params.set("new", "1");
    history.pushState(null, "", `/admin/?${params}`);
    currentUrl.current = location.href;
    setView(next);
    setEditing(path || null);
    setCreating(create);
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }
  const refreshJobs = useCallback(
    async (reconcile = false) => {
      try {
        setJobs(
          await api<Job[]>(
            reconcile ? "/jobs/refresh" : "/jobs",
            reconcile ? { method: "POST" } : {},
          ),
        );
      } catch (error) {
        notify((error as Error).message, true);
      }
    },
    [notify],
  );
  useEffect(() => {
    if (!session || editing || creating) return;
    if (view === "jobs" || view === "overview") void refreshJobs();
    if (view === "media") {
      setBusy(true);
      void api<Media[]>("/media")
        .then(setMedia)
        .catch((error) => notify(error.message, true))
        .finally(() => setBusy(false));
    }
    if (view === "analytics") {
      setBusy(true);
      void api<Analytics>(`/analytics?days=${days}`)
        .then(setAnalytics)
        .catch((error) => notify(error.message, true))
        .finally(() => setBusy(false));
    }
  }, [view, session, editing, creating, days, refreshJobs, notify]);
  useEffect(() => {
    if (
      view !== "jobs" ||
      !jobs.some((job) => ["building", "committing"].includes(job.status))
    )
      return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshJobs(true);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [view, jobs, refreshJobs]);
  useEffect(() => {
    setPage(1);
  }, [query, filter, status]);
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const result = await api<Media>("/media", {
        method: "POST",
        body: file,
        headers: {
          "Content-Type": file.type,
          "X-File-Name": encodeURIComponent(file.name),
        },
      });
      setMedia((current) => [result, ...current]);
      notify("图片已上传，可以复制地址或 Markdown");
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify("已复制到剪贴板");
    } catch {
      notify("浏览器未允许复制，请手动复制图片地址", true);
    }
  }
  async function restoreJob(job: Job) {
    try {
      await api("/jobs/restore", {
        method: "POST",
        body: JSON.stringify({ id: job.id }),
      });
      await reloadContent();
      navigate("content", job.path);
      notify("发布快照已恢复为草稿，请确认内容后再发布");
    } catch (error) {
      notify((error as Error).message, true);
    }
  }
  const combined: ListedEntry[] = [
    ...entries,
    ...drafts
      .filter((draft) => !entries.some((entry) => entry.path === draft.path))
      .map((draft) => ({
        path: draft.path,
        sha: null,
        data: { ...draft.data, draft: true },
        href: "",
      })),
  ];
  const sorted = [...combined].sort(
    (a, b) =>
      String(b.data.created || "").localeCompare(
        String(a.data.created || ""),
      ) || a.path.localeCompare(b.path),
  );
  const filtered = sorted.filter(
    (entry) =>
      (filter === "all" ||
        (filter === "pages"
          ? singleton.includes(entry.path.split("/")[2])
          : entry.path.split("/")[2] === filter)) &&
      (status === "all" ||
        (status === "draft"
          ? drafts.some((draft) => draft.path === entry.path) ||
            entry.data.draft === true
          : !drafts.some((draft) => draft.path === entry.path) &&
            entry.data.draft !== true)) &&
      `${entry.data.title} ${entry.path} ${JSON.stringify(entry.data.tags || [])}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const visible = filtered.slice(
    (Math.min(page, pages) - 1) * 10,
    Math.min(page, pages) * 10,
  );
  const title = NAV.find((item) => item.id === view)?.label || "工作台";
  const trafficEmptyMessage =
    analytics?.traffic.status === "ready"
      ? undefined
      : analytics?.traffic.status === "error"
        ? "统计查询失败，请检查上方错误信息。"
        : "尚未连接 Cloudflare，暂时无法查询。";
  const published = entries.filter(
    (entry) => !entry.path.endsWith("/-index.md") && entry.data.draft !== true,
  ).length;
  return (
    <Theme
      accentColor="jade"
      grayColor="sand"
      radius="medium"
      scaling="100%"
      appearance="light"
    >
      <div className="cms-shell">
        <aside className={`cms-sidebar ${menuOpen ? "is-open" : ""}`}>
          <a
            href="/admin/"
            className="cms-brand"
            onClick={(event) => {
              event.preventDefault();
              navigate("overview");
            }}
          >
            <span>
              Tsukikage<small>博客管理</small>
            </span>
          </a>
          <nav aria-label="后台导航">
            {([NAV.slice(0, 3), NAV.slice(3)] as const).map((group, index) => (
              <div className="cms-nav-group" key={index}>
                <p>{index === 0 ? "写作" : "网站"}</p>
                {group.map((item) => (
                  <button
                    key={item.id}
                    className={view === item.id ? "is-active" : ""}
                    onClick={() => navigate(item.id)}
                  >
                    <item.icon />
                    {item.label}
                    {item.id === "content" && <span>{combined.length}</span>}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="cms-sidebar-bottom">
            <a
              href={session?.mode === "cloudflare" ? session.siteUrl : "/"}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLinkIcon />
              打开博客
            </a>
            <div className="cms-profile">
              <span>T</span>
              <div>
                {session?.user || "内容管理"}
                <small>
                  {session?.mode === "local"
                    ? "草稿保存在此设备"
                    : "Cloudflare"}
                </small>
              </div>
            </div>
          </div>
        </aside>
        <main className="cms-main">
          <header className="cms-topbar">
            <Button
              className="cms-mobile-menu"
              variant="ghost"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="切换导航"
            >
              <DashboardIcon />
            </Button>
            <span>
              博客管理{" "}
              <span className="cms-breadcrumb">
                / {editing || creating ? "编辑内容" : title}
              </span>
            </span>
            <div>
              <Badge
                variant="soft"
                color={session?.mode === "local" ? "amber" : "jade"}
              >
                {session?.mode === "local" ? "本地模式" : "Cloudflare"}
              </Badge>
              <a
                href={session?.siteUrl || "https://tsukikage7.com"}
                target="_blank"
                rel="noopener noreferrer"
              >
                查看网站
                <ExternalLinkIcon />
              </a>
            </div>
          </header>
          {toast && (
            <div
              className={`cms-toast ${toast.error ? "is-error" : ""}`}
              role={toast.error ? "alert" : "status"}
            >
              <InfoCircledIcon />
              <span>{toast.message}</span>
              <button aria-label="关闭提示" onClick={() => setToast(null)}>
                <Cross2Icon />
              </button>
            </div>
          )}
          {loading ? (
            <div className="cms-loading">正在载入博客管理…</div>
          ) : sessionError ? (
            <div className="cms-page">
              <Empty
                title="暂时无法连接管理服务"
                description={sessionError}
                action={
                  <Button onClick={() => void boot()}>
                    <ReloadIcon />
                    重试连接
                  </Button>
                }
              />
            </div>
          ) : session && (editing || creating) ? (
            <Editor
              key={editing || "new"}
              initialPath={editing || undefined}
              session={session}
              onClose={() => navigate("content")}
              onChanged={contentChanged}
              onDirtyChange={onDirtyChange}
              notify={notify}
            />
          ) : (
            <div
              className={`cms-page ${view === "overview" ? "cms-workspace" : ""}`}
            >
              {view === "overview" ? (
                <>
                  <div className="cms-page-heading cms-workspace-heading">
                    <div>
                      <p className="cms-eyebrow">
                        写作手记{" "}
                        <span>
                          {" "}
                          /{" "}
                          {new Intl.DateTimeFormat("zh-CN", {
                            month: "long",
                            day: "numeric",
                            weekday: "long",
                            timeZone: "Asia/Singapore",
                          }).format(new Date())}
                        </span>
                      </p>
                      <h1>今天，想写些什么？</h1>
                      <p>接着写一篇旧稿，或从一个新的念头开始。</p>
                    </div>
                    <Button
                      size="3"
                      onClick={() => navigate("content", undefined, true)}
                    >
                      <PlusIcon />
                      开始一篇新作
                    </Button>
                  </div>
                  <div className="cms-overview-grid">
                    <section className="cms-panel">
                      <div className="cms-panel-heading">
                        <h2>最近的文字</h2>
                        <Button
                          variant="ghost"
                          onClick={() => navigate("content")}
                        >
                          全部内容
                          <ArrowRightIcon />
                        </Button>
                      </div>
                      <div className="cms-recent-list">
                        {sorted
                          .filter((entry) => !entry.path.endsWith("/-index.md"))
                          .slice(0, 4)
                          .map((entry, index) => (
                            <button
                              key={entry.path}
                              onClick={() => navigate("content", entry.path)}
                            >
                              <span className="cms-entry-number">
                                {String(index + 1).padStart(2, "0")}
                              </span>
                              <span>
                                <strong>{String(entry.data.title)}</strong>
                                <small>
                                  {
                                    COLLECTIONS[
                                      entry.path.split("/")[2] as Collection
                                    ]
                                  }{" "}
                                  · {displayDate(entry.data.created)}
                                </small>
                              </span>
                              <ArrowRightIcon />
                            </button>
                          ))}
                      </div>
                    </section>
                    <section className="cms-panel cms-writing-panel">
                      <div className="cms-panel-heading">
                        <h2>继续写</h2>
                        <Badge variant="soft">{drafts.length} 份草稿</Badge>
                      </div>
                      {drafts.length ? (
                        drafts.slice(0, 5).map((draft) => (
                          <button
                            className="cms-draft-row"
                            key={draft.path}
                            onClick={() => navigate("content", draft.path)}
                          >
                            <strong>
                              {String(
                                entries.find(
                                  (entry) => entry.path === draft.path,
                                )?.data.title ||
                                  draft.data.title ||
                                  draft.path.split("/").at(-1),
                              )}
                            </strong>
                            <small>{formatTime(draft.savedAt)}</small>
                            <ArrowRightIcon />
                          </button>
                        ))
                      ) : (
                        <Empty
                          title="留一页，给新的念头"
                          description="这里会收好你未写完的文字，下次回来可以接着写。"
                          action={
                            <Button
                              variant="soft"
                              onClick={() =>
                                navigate("content", undefined, true)
                              }
                            >
                              开始写作
                              <ArrowRightIcon />
                            </Button>
                          }
                        />
                      )}
                    </section>
                  </div>
                  <div className="cms-metrics">
                    <Metric
                      label="内容总数"
                      value={combined.length}
                      caption="文章、创作、笔记与页面"
                    />
                    <Metric
                      label="待处理草稿"
                      value={drafts.length}
                      caption="单独保存，源文件尚未改变"
                    />
                    <Metric
                      label="可展示内容"
                      value={published}
                      caption="源文件中的非隐藏内容"
                    />
                    <Metric
                      label="最近发布"
                      value={jobs[0] ? JOB_LABELS[jobs[0].status] : "暂无"}
                      caption={
                        jobs[0]
                          ? formatTime(jobs[0].createdAt)
                          : "完成发布后记录在这里"
                      }
                    />
                  </div>
                  <section className="cms-connection-strip">
                    <div>
                      <CheckCircledIcon />
                      <span>
                        <strong>你的文字仍然属于你</strong>
                        <small>
                          完整 Markdown / MDX 源码，沿用博客现有内容结构。
                        </small>
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => navigate("settings")}
                    >
                      查看连接状态
                      <ArrowRightIcon />
                    </Button>
                  </section>
                </>
              ) : view === "content" ? (
                <>
                  <div className="cms-page-heading">
                    <div>
                      <h1>内容管理</h1>
                      <p>文章、创作和页面，都从这里整理。</p>
                    </div>
                    <Button
                      onClick={() => navigate("content", undefined, true)}
                    >
                      <PlusIcon />
                      新建内容
                    </Button>
                  </div>
                  <div className="cms-content-tabs">
                    {[
                      ["all", "全部内容"],
                      ["writings", "创作"],
                      ["blog", "文章"],
                      ["notes", "笔记"],
                      ["series", "合集"],
                      ["pages", "页面"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        className={
                          filter === value ||
                          (value === "pages" && singleton.includes(filter))
                            ? "is-active"
                            : ""
                        }
                        onClick={() => setFilter(value)}
                      >
                        {label}
                        <span>
                          {value === "all"
                            ? combined.length
                            : value === "pages"
                              ? combined.filter((entry) =>
                                  singleton.includes(entry.path.split("/")[2]),
                                ).length
                              : combined.filter(
                                  (entry) => entry.path.split("/")[2] === value,
                                ).length}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="cms-filterbar">
                    <TextField.Root
                      placeholder="搜索标题、标签或文件名"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                    >
                      <TextField.Slot>
                        <MagnifyingGlassIcon />
                      </TextField.Slot>
                    </TextField.Root>
                    <Select.Root value={filter} onValueChange={setFilter}>
                      <Select.Trigger aria-label="筛选内容集合" />
                      <Select.Content>
                        <Select.Item value="all">所有集合</Select.Item>
                        <Select.Item value="pages">所有页面</Select.Item>
                        {Object.entries(COLLECTIONS).map(([value, label]) => (
                          <Select.Item key={value} value={value}>
                            {label}
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>
                    <Select.Root value={status} onValueChange={setStatus}>
                      <Select.Trigger aria-label="筛选内容状态" />
                      <Select.Content>
                        <Select.Item value="all">所有状态</Select.Item>
                        <Select.Item value="draft">有草稿 / 隐藏</Select.Item>
                        <Select.Item value="source">源文件</Select.Item>
                      </Select.Content>
                    </Select.Root>
                    <Button variant="soft" onClick={() => void reloadContent()}>
                      <ReloadIcon />
                      刷新
                    </Button>
                  </div>
                  <section className="cms-panel cms-content-table">
                    {visible.length ? (
                      <Table.Root>
                        <Table.Header>
                          <Table.Row>
                            <Table.ColumnHeaderCell>
                              标题
                            </Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>
                              类型
                            </Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>
                              状态
                            </Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell>
                              发布日期
                            </Table.ColumnHeaderCell>
                            <Table.ColumnHeaderCell align="right">
                              操作
                            </Table.ColumnHeaderCell>
                          </Table.Row>
                        </Table.Header>
                        <Table.Body>
                          {visible.map((entry) => (
                            <Table.Row key={entry.path}>
                              <Table.RowHeaderCell>
                                <button
                                  className="cms-title-link"
                                  onClick={() =>
                                    navigate("content", entry.path)
                                  }
                                >
                                  {String(entry.data.title)}
                                </button>
                                <small className="cms-table-path">
                                  {entry.path.replace("src/content/", "")}
                                </small>
                              </Table.RowHeaderCell>
                              <Table.Cell>
                                {
                                  COLLECTIONS[
                                    entry.path.split("/")[2] as Collection
                                  ]
                                }
                              </Table.Cell>
                              <Table.Cell>
                                <Badge
                                  color={
                                    entry.error
                                      ? "red"
                                      : drafts.some(
                                            (draft) =>
                                              draft.path === entry.path,
                                          )
                                        ? "amber"
                                        : entry.data.draft === true
                                          ? "gray"
                                          : "jade"
                                  }
                                  variant="soft"
                                >
                                  {entry.error
                                    ? "格式异常"
                                    : drafts.some(
                                          (draft) => draft.path === entry.path,
                                        )
                                      ? "有草稿"
                                      : entry.data.draft === true
                                        ? "隐藏"
                                        : "源文件"}
                                </Badge>
                              </Table.Cell>
                              <Table.Cell>
                                {displayDate(entry.data.created)}
                              </Table.Cell>
                              <Table.Cell align="right">
                                <Button
                                  size="1"
                                  variant="ghost"
                                  onClick={() =>
                                    navigate("content", entry.path)
                                  }
                                >
                                  编辑
                                  <ArrowRightIcon />
                                </Button>
                              </Table.Cell>
                            </Table.Row>
                          ))}
                        </Table.Body>
                      </Table.Root>
                    ) : (
                      <Empty
                        title="没有找到内容"
                        description="换一个关键词或筛选条件试试。"
                      />
                    )}
                  </section>
                  <div className="cms-pagination">
                    <span>
                      共 {filtered.length} 项 · 第 {Math.min(page, pages)} /{" "}
                      {pages} 页
                    </span>
                    <Button
                      size="1"
                      variant="soft"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      <ArrowLeftIcon />
                      上一页
                    </Button>
                    <Button
                      size="1"
                      variant="soft"
                      disabled={page >= pages}
                      onClick={() => setPage(page + 1)}
                    >
                      下一页
                      <ArrowRightIcon />
                    </Button>
                  </div>
                </>
              ) : view === "media" ? (
                <>
                  <div className="cms-page-heading">
                    <div>
                      <h1>媒体库</h1>
                      <p>通过后台上传的图片，可在文章中重复使用。</p>
                    </div>
                    <Button
                      disabled={busy}
                      onClick={() => uploadInput.current?.click()}
                    >
                      <PlusIcon />
                      上传图片
                    </Button>
                    <input
                      hidden
                      ref={uploadInput}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      onChange={(event) => {
                        void upload(event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </div>
                  <p className="cms-help">
                    支持 PNG、JPEG、GIF、WebP，单张最大 8 MiB。
                    {session?.mode === "local"
                      ? "本地图片随博客构建发布。"
                      : "图片直接存入 Cloudflare R2。"}
                  </p>
                  {media.length ? (
                    <div className="cms-media-grid">
                      {media.map((image) => (
                        <section className="cms-media-card" key={image.id}>
                          <a
                            href={image.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <img
                              src={image.url}
                              alt={image.name}
                              loading="lazy"
                            />
                          </a>
                          <div>
                            <strong>{image.name}</strong>
                            <small>
                              {(image.size / 1024).toFixed(1)} KB ·{" "}
                              {formatTime(image.createdAt)}
                            </small>
                            <TextField.Root
                              value={image.url}
                              readOnly
                              aria-label={`${image.name} 的图片地址`}
                            />
                            <div className="cms-media-actions">
                              <Button
                                size="1"
                                variant="soft"
                                onClick={() => void copy(image.url)}
                              >
                                复制地址
                              </Button>
                              <Button
                                size="1"
                                variant="ghost"
                                onClick={() =>
                                  void copy(
                                    `![${image.name.replace(/[\[\]\n]/g, "")}](${image.url})`,
                                  )
                                }
                              >
                                复制 Markdown
                              </Button>
                            </div>
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title={busy ? "正在载入媒体…" : "上传第一张图片"}
                      description="封面、旅途里的照片，或给文字作配的画面。上传后会出现在这里。"
                    />
                  )}
                </>
              ) : view === "analytics" ? (
                <>
                  <div className="cms-page-heading">
                    <div>
                      <h1>访问统计</h1>
                      <p>看看谁来过，以及他们读了什么。</p>
                    </div>
                    <Select.Root
                      value={String(days)}
                      onValueChange={(value) => setDays(Number(value))}
                    >
                      <Select.Trigger aria-label="统计时间范围" />
                      <Select.Content>
                        {[7, 14, 30].map((value) => (
                          <Select.Item key={value} value={String(value)}>
                            最近 {value} 天
                          </Select.Item>
                        ))}
                      </Select.Content>
                    </Select.Root>
                  </div>
                  {busy ? (
                    <div className="cms-loading">正在查询 Cloudflare 指标…</div>
                  ) : analytics ? (
                    <>
                      {analytics.traffic.status !== "ready" && (
                        <Callout.Root
                          color={
                            analytics.traffic.status === "error"
                              ? "red"
                              : "amber"
                          }
                        >
                          <Callout.Icon>
                            <InfoCircledIcon />
                          </Callout.Icon>
                          <Callout.Text>
                            {analytics.traffic.message}
                          </Callout.Text>
                        </Callout.Root>
                      )}
                      <div className="cms-metrics">
                        <Metric
                          label="浏览量 PV"
                          value={
                            analytics.traffic.data
                              ? countFormat(analytics.traffic.data.views)
                              : "待连接"
                          }
                          caption="Cloudflare 浏览器页面加载统计"
                        />
                        <Metric
                          label="访问次数"
                          value={
                            analytics.traffic.data
                              ? countFormat(analytics.traffic.data.visits)
                              : "待连接"
                          }
                          caption="访问次数不等同于独立访客数"
                        />
                        <Metric
                          label="Worker 请求"
                          value={
                            analytics.workers.data
                              ? countFormat(analytics.workers.data.requests)
                              : "待连接"
                          }
                          caption="Worker 调用次数，不等同于 PV"
                        />
                        <Metric
                          label="Worker 错误"
                          value={
                            analytics.workers.data
                              ? countFormat(analytics.workers.data.errors)
                              : "待连接"
                          }
                          caption={
                            analytics.workers.data
                              ? `错误率 ${analytics.workers.data.requests ? ((analytics.workers.data.errors / analytics.workers.data.requests) * 100).toFixed(2) : "0.00"}%`
                              : "需要 Cloudflare Analytics 权限"
                          }
                        />
                      </div>
                      <section className="cms-panel">
                        <div className="cms-panel-heading">
                          <h2>浏览量趋势</h2>
                          <span>最近 {days} 天 · UTC 日期</span>
                        </div>
                        <Trend rows={analytics.traffic.data?.days || []} />
                      </section>
                      <div className="cms-breakdowns">
                        <Breakdown
                          emptyMessage={trafficEmptyMessage}
                          title="访客地域（国家）"
                          rows={analytics.traffic.data?.countries || []}
                        />
                        <Breakdown
                          emptyMessage={trafficEmptyMessage}
                          title="热门页面"
                          rows={analytics.traffic.data?.pages || []}
                        />
                        <Breakdown
                          emptyMessage={trafficEmptyMessage}
                          title="访问来源"
                          rows={analytics.traffic.data?.referrers || []}
                        />
                        <Breakdown
                          emptyMessage={trafficEmptyMessage}
                          title="设备类型"
                          rows={analytics.traffic.data?.devices || []}
                        />
                      </div>
                      {analytics.workers.status !== "ready" && (
                        <p className="cms-inline-error">
                          Worker 指标：{analytics.workers.message}
                        </p>
                      )}
                      <p className="cms-help">
                        Web Analytics
                        已排除其识别出的机器人流量，数据可能被采样。静态资源请求、Worker
                        调用和页面浏览使用不同统计口径。
                      </p>
                    </>
                  ) : (
                    <Empty
                      title="暂未取得统计结果"
                      description="可以检查连接设置后重新查询。"
                    />
                  )}
                </>
              ) : view === "jobs" ? (
                <>
                  <div className="cms-page-heading">
                    <div>
                      <h1>发布记录</h1>
                      <p>提交、构建、上线，每一步都有明确的状态。</p>
                    </div>
                    <Button
                      variant="soft"
                      onClick={() => void refreshJobs(true)}
                    >
                      <ReloadIcon />
                      核对发布状态
                    </Button>
                  </div>
                  {jobs.length ? (
                    <div className="cms-jobs">
                      {jobs.map((job) => (
                        <section className="cms-panel cms-job" key={job.id}>
                          <div>
                            <Badge
                              color={
                                job.status === "failed"
                                  ? "red"
                                  : job.status === "live"
                                    ? "jade"
                                    : "amber"
                              }
                            >
                              {JOB_LABELS[job.status]}
                            </Badge>
                            <h2>
                              {String(
                                entries.find((entry) => entry.path === job.path)
                                  ?.data.title || job.path.split("/").at(-1),
                              )}
                            </h2>
                            <p>{job.message}</p>
                            <small>
                              {formatTime(job.createdAt)} · {job.actor}
                            </small>
                            <code>
                              {job.commit
                                ? job.commit.slice(0, 12)
                                : "本地 / 尚无提交"}{" "}
                              · {job.path}
                            </code>
                          </div>
                          <div className="cms-job-actions">
                            <Button
                              variant="soft"
                              onClick={() => navigate("content", job.path)}
                            >
                              查看内容
                            </Button>
                            {["failed", "local", "live"].includes(
                              job.status,
                            ) && (
                              <Button
                                variant="ghost"
                                onClick={() => void restoreJob(job)}
                              >
                                恢复为草稿
                              </Button>
                            )}
                          </div>
                        </section>
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title="还没有发布记录"
                      description="保存并发布第一篇内容后，记录会出现在这里。本地应用与线上发布分别标记。"
                    />
                  )}
                </>
              ) : (
                <>
                  <div className="cms-page-heading">
                    <div>
                      <h1>连接设置</h1>
                      <p>内容、图片和统计服务的当前连接状态。</p>
                    </div>
                    <Button variant="soft" onClick={() => void boot()}>
                      <ReloadIcon />
                      刷新状态
                    </Button>
                  </div>
                  <section className="cms-panel cms-settings">
                    {session?.integrations.map((item) => (
                      <div className="cms-setting-row" key={item.name}>
                        <span className="cms-setting-icon">
                          {item.ready ? (
                            <CheckCircledIcon />
                          ) : (
                            <InfoCircledIcon />
                          )}
                        </span>
                        <div>
                          <h2>{item.name}</h2>
                          <p>{item.detail}</p>
                        </div>
                        <Badge
                          variant="soft"
                          color={item.ready ? "jade" : "amber"}
                        >
                          {item.ready ? "配置就绪" : "待配置"}
                        </Badge>
                      </div>
                    ))}
                  </section>
                  <section className="cms-panel cms-setup-notes">
                    <h2>Cloudflare 部署配置</h2>
                    <p>
                      线上后台使用独立的 blog-cms
                      Worker，博客继续静态构建。草稿存入 D1，图片存入
                      R2，发布写回 GitHub。
                    </p>
                    <ol>
                      <li>
                        在 wrangler.cms.jsonc 绑定已创建的 D1 数据库并应用迁移。
                      </li>
                      <li>
                        为后台域名配置 Cloudflare Access，填写团队域名、AUD
                        和允许登录的邮箱。
                      </li>
                      <li>
                        通过 Wrangler Secrets 设置 CMS_GITHUB_TOKEN、
                        CLOUDFLARE_ANALYTICS_TOKEN 与 CLOUDFLARE_BUILD_TOKEN。
                      </li>
                      <li>
                        运行 pnpm cms:deploy 部署后台。完整说明见项目
                        docs/cms.md。
                      </li>
                    </ol>
                    <p className="cms-help">
                      凭据只在服务端读取。未配置 Access
                      时，线上管理接口保持锁定。
                    </p>
                  </section>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </Theme>
  );
}
