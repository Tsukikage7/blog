import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  Select,
  Tabs,
  TextArea,
  TextField,
} from "@radix-ui/themes";
import {
  ArrowLeftIcon,
  CheckIcon,
  ImageIcon,
  PaperPlaneIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import {
  COLLECTIONS,
  type Collection,
  type Draft,
  type Entry,
  type Media,
  type Metadata,
  type PublishJob,
  type Revision,
  type Session,
} from "../../cms/types";
import {
  contentPath,
  newSource,
  patchMetadata,
  splitSource,
} from "../../cms/content";
import { api, formatTime } from "./api";
import Preview from "./Preview";

type LoadedEntry = {
  entry: Entry | null;
  draft: Draft | null;
  revisions: Revision[];
};
type Props = {
  initialPath?: string;
  session: Session;
  onClose: () => void;
  onChanged: () => void;
  notify: (message: string, error?: boolean) => void;
  onDirtyChange: (dirty: boolean) => void;
};
function ListField({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (items: string[]) => void;
}) {
  const formatted = Array.isArray(value) ? value.join(", ") : "";
  const [text, setText] = useState(formatted);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(formatted);
  }, [formatted]);
  return (
    <TextField.Root
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        onChange(
          text
            .split(/[,，]/)
            .map((item) => item.trim())
            .filter(Boolean),
        );
      }}
      onChange={(event) => setText(event.target.value)}
    />
  );
}
export default function Editor({
  initialPath,
  session,
  onClose,
  onChanged,
  notify,
  onDirtyChange,
}: Props) {
  const [path, setPath] = useState(initialPath || "");
  const [collection, setCollection] = useState<Collection>("writings");
  const [slug, setSlug] = useState("");
  const [source, setSource] = useState(
    initialPath ? "" : newSource("writings"),
  );
  const [baseline, setBaseline] = useState(
    initialPath ? "" : newSource("writings"),
  );
  const [entry, setEntry] = useState<Entry | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [history, setHistory] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(Boolean(initialPath));
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saveState, setSaveState] = useState("尚未保存");
  const [publishDialog, setPublishDialog] = useState(false);
  const [discardDialog, setDiscardDialog] = useState(false);
  const [tab, setTab] = useState("split");
  const saving = useRef(false);
  const failedSource = useRef<string | null>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const dirty = source !== baseline;
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, source, baseline, onDirtyChange]);
  let metadata: Metadata = {};
  let parseError = "";
  try {
    metadata = splitSource(source).data;
  } catch (error) {
    parseError = error instanceof Error ? error.message : "YAML 格式错误";
  }
  const load = useCallback(async () => {
    if (!initialPath) return;
    setLoading(true);
    try {
      const result = await api<LoadedEntry>(
        `/entry?path=${encodeURIComponent(initialPath)}`,
      );
      if (!result.entry && !result.draft) throw new Error("内容不存在");
      setEntry(result.entry);
      setDraft(result.draft);
      setHistory(result.revisions);
      const text = result.draft?.source ?? result.entry!.source;
      setSource(text);
      setBaseline(text);
      setCollection(initialPath.split("/")[2] as Collection);
      setSaveState(
        result.draft
          ? `已保存 · ${formatTime(result.draft.savedAt)}`
          : "当前源文件",
      );
    } catch (error) {
      notify(String(error instanceof Error ? error.message : error), true);
    } finally {
      setLoading(false);
    }
  }, [initialPath, notify]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const actualPath =
    path || (slug ? `src/content/${collection}/${slug}.md` : "");
  const save = useCallback(
    async (text = source, silent = false) => {
      if (saving.current) throw new Error("正在保存，请稍后重试");
      if (!actualPath) throw new Error("请先填写文章标识");
      contentPath(actualPath);
      saving.current = true;
      setBusy(true);
      setSaveState("正在保存…");
      try {
        const result = await api<Draft>("/draft", {
          method: "PUT",
          body: JSON.stringify({
            path: actualPath,
            source: text,
            revision: draft?.revision ?? 0,
            baseSha: draft?.baseSha ?? entry?.sha ?? null,
          }),
        });
        setDraft(result);
        failedSource.current = null;
        setPath(actualPath);
        if (!path) {
          const params = new URLSearchParams({
            view: "content",
            path: actualPath,
          });
          window.history.replaceState(null, "", `/admin/?${params}`);
        }
        setBaseline(text);
        setSaveState(`已保存 · ${formatTime(result.savedAt)}`);
        onChanged();
        if (!silent) notify("草稿已保存，网站正文尚未改变");
        return result;
      } catch (error) {
        failedSource.current = text;
        setSaveState("保存失败，修改仍保留在编辑器中");
        throw error;
      } finally {
        saving.current = false;
        setBusy(false);
      }
    },
    [actualPath, source, draft, entry, onChanged, notify, path],
  );
  useEffect(() => {
    if (
      !dirty ||
      !actualPath ||
      loading ||
      busy ||
      publishing ||
      parseError ||
      failedSource.current === source
    )
      return;
    const timer = window.setTimeout(() => {
      void save(source, true).catch((error) => notify(error.message, true));
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [
    dirty,
    actualPath,
    loading,
    busy,
    publishing,
    parseError,
    source,
    save,
    notify,
  ]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (!saving.current && !publishing)
          void save().catch((error) => notify(error.message, true));
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [save, notify, publishing]);
  function patch(changes: Metadata) {
    try {
      setSource(patchMetadata(source, changes));
    } catch (error) {
      notify((error as Error).message, true);
    }
  }
  async function publish() {
    setPublishDialog(false);
    setPublishing(true);
    try {
      const text = patchMetadata(source, { draft: false });
      setSource(text);
      const saved = await save(text, true);
      setBusy(true);
      const job = await api<PublishJob>("/publish", {
        method: "POST",
        body: JSON.stringify({ path: actualPath, revision: saved.revision }),
      });
      notify(job.message);
      onChanged();
      onDirtyChange(false);
      onClose();
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(false);
      setPublishing(false);
    }
  }
  async function discard() {
    try {
      if (draft)
        await api("/draft", {
          method: "DELETE",
          body: JSON.stringify({ path: actualPath, revision: draft.revision }),
        });
      setDiscardDialog(false);
      onChanged();
      onDirtyChange(false);
      onClose();
      notify("草稿已丢弃，源文件未改变");
    } catch (error) {
      notify((error as Error).message, true);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      const media = await api<Media>("/media", {
        method: "POST",
        body: file,
        headers: {
          "Content-Type": file.type,
          "X-File-Name": encodeURIComponent(file.name),
        },
      });
      setSource(
        (current) =>
          `${current}\n\n![${file.name.replace(/[\[\]\n]/g, "")}](${media.url})\n`,
      );
      notify("图片已上传并插入文末");
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <div className="cms-loading">正在载入文章与草稿…</div>;
  return (
    <div className="cms-editor">
      <div className="cms-editor-toolbar">
        <Button variant="ghost" disabled={publishing} onClick={onClose}>
          <ArrowLeftIcon />
          内容列表
        </Button>
        <span className="cms-save-state" role="status">
          {saveState}
        </span>
        <div className="cms-toolbar-actions">
          <Button
            variant="soft"
            disabled={busy || !actualPath || Boolean(parseError)}
            onClick={() =>
              void save().catch((error) => notify(error.message, true))
            }
          >
            <CheckIcon />
            保存草稿
          </Button>
          <Button
            disabled={busy || !actualPath || Boolean(parseError)}
            onClick={() => setPublishDialog(true)}
          >
            <PaperPlaneIcon />
            {session.mode === "local" ? "应用到本地" : "发布文章"}
          </Button>
        </div>
      </div>
      <div className="cms-editor-heading">
        <Badge variant="soft">{COLLECTIONS[collection]}</Badge>
        <h1>{String(metadata.title || "开始一篇新内容")}</h1>
        <p>{actualPath || "给文章一个稳定的链接标识"}</p>
      </div>
      {parseError && (
        <p className="cms-inline-error" role="alert">
          {parseError}
        </p>
      )}
      {draft && entry && draft.baseSha !== entry.sha && (
        <p className="cms-inline-error">
          源文件在草稿创建后发生过修改。请先复制你的草稿，再丢弃草稿并载入最新源文件合并；系统会阻止覆盖发布。
        </p>
      )}
      <div className="cms-editor-layout">
        <div className="cms-editor-main">
          <Tabs.Root value={tab} onValueChange={setTab}>
            <Tabs.List>
              <Tabs.Trigger value="split">编辑与预览</Tabs.Trigger>
              <Tabs.Trigger value="source">完整源码</Tabs.Trigger>
              <Tabs.Trigger value="preview">阅读预览</Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>
          <div className={`cms-edit-panes cms-edit-${tab}`}>
            {tab !== "preview" && (
              <div className="cms-source-pane">
                <div className="cms-pane-label">
                  Markdown / MDX <span>⌘ / Ctrl + S 保存</span>
                </div>
                <CodeMirror
                  aria-label="文章完整源码"
                  value={source}
                  editable={!publishing}
                  extensions={[markdown()]}
                  onChange={setSource}
                  height="100%"
                  basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLine: true,
                  }}
                />
              </div>
            )}
            {tab !== "source" && <Preview source={source} />}
          </div>
        </div>
        <fieldset
          className="cms-editor-settings"
          disabled={publishing}
          style={{ margin: 0, minWidth: 0 }}
        >
          <h2>文章设置</h2>
          {!path && (
            <>
              <label>
                内容类型
                <Select.Root
                  value={collection}
                  onValueChange={(value) => {
                    setCollection(value as Collection);
                    setSource(newSource(value as Collection));
                  }}
                >
                  <Select.Trigger />
                  <Select.Content>
                    {(
                      ["writings", "blog", "notes", "series"] as Collection[]
                    ).map((key) => (
                      <Select.Item key={key} value={key}>
                        {COLLECTIONS[key]}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </label>
              <label>
                链接标识
                <TextField.Root
                  value={slug}
                  placeholder="例如：a-rainy-afternoon"
                  onChange={(event) => setSlug(event.target.value)}
                />
              </label>
            </>
          )}
          <label>
            标题
            <TextField.Root
              value={String(metadata.title || "")}
              disabled={Boolean(parseError)}
              onChange={(event) => patch({ title: event.target.value })}
            />
          </label>
          <label>
            摘要
            <TextArea
              rows={3}
              value={String(metadata.description || "")}
              disabled={Boolean(parseError)}
              onChange={(event) => patch({ description: event.target.value })}
            />
          </label>
          <div className="cms-field-pair">
            {["created", "updated"].map((key) => (
              <label key={key}>
                {key === "created" ? "发布日期" : "更新日期"}
                <TextField.Root
                  type="date"
                  value={
                    typeof metadata[key] === "string"
                      ? String(metadata[key]).slice(0, 10)
                      : ""
                  }
                  onChange={(event) => patch({ [key]: event.target.value })}
                />
              </label>
            ))}
          </div>
          {collection === "blog" && (
            <label>
              分类（逗号分隔）
              <ListField
                value={metadata.categories}
                onChange={(items) => patch({ categories: items })}
              />
            </label>
          )}
          {["blog", "notes", "writings"].includes(collection) && (
            <>
              <label>
                标签（逗号分隔）
                <ListField
                  value={metadata.tags}
                  onChange={(items) => patch({ tags: items })}
                />
              </label>
              <label>
                合集标识
                <TextField.Root
                  value={String(metadata.series || "")}
                  onChange={(event) =>
                    patch(
                      event.target.value
                        ? { series: event.target.value }
                        : { series: "", seriesOrder: "" },
                    )
                  }
                />
              </label>
              {Boolean(metadata.series) && (
                <label>
                  章节顺序
                  <TextField.Root
                    type="number"
                    min="1"
                    value={String(metadata.seriesOrder || "")}
                    onChange={(event) =>
                      patch({ seriesOrder: Number(event.target.value) })
                    }
                  />
                </label>
              )}
            </>
          )}
          {collection === "writings" && (
            <label>
              体裁
              <Select.Root
                value={String(metadata.genre || "随笔")}
                onValueChange={(value) => patch({ genre: value })}
              >
                <Select.Trigger />
                <Select.Content>
                  {["小说", "短篇小说", "散文", "诗歌", "杂文", "随笔"].map(
                    (value) => (
                      <Select.Item key={value} value={value}>
                        {value}
                      </Select.Item>
                    ),
                  )}
                </Select.Content>
              </Select.Root>
            </label>
          )}
          {collection === "series" && (
            <label>
              合集类型
              <Select.Root
                value={String(metadata.kind || "technical")}
                onValueChange={(value) => patch({ kind: value })}
              >
                <Select.Trigger />
                <Select.Content>
                  <Select.Item value="technical">技术文章</Select.Item>
                  <Select.Item value="literary">文学创作</Select.Item>
                </Select.Content>
              </Select.Root>
            </label>
          )}
          <label>
            封面地址
            <TextField.Root
              value={String(metadata.image || "")}
              onChange={(event) => patch({ image: event.target.value })}
            />
          </label>
          <label className="cms-checkbox-label">
            <Checkbox
              checked={metadata.draft === true}
              onCheckedChange={(value) => patch({ draft: value === true })}
            />
            在博客中隐藏（draft）
          </label>
          <input
            ref={uploadInput}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            hidden
            onChange={(event) => {
              void upload(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <Button
            variant="soft"
            disabled={busy}
            onClick={() => uploadInput.current?.click()}
          >
            <ImageIcon />
            上传并插入图片
          </Button>
          <p className="cms-help">
            简历、社交链接和其他扩展字段，可直接在完整源码里编辑。已有字段会保留。
          </p>
          <details>
            <summary>历史草稿版本</summary>
            {history.length ? (
              history.map((item) => (
                <button
                  className="cms-history-item"
                  key={item.id}
                  onClick={() => {
                    if (
                      !dirty ||
                      window.confirm(
                        "恢复旧版本将替换编辑器中的未保存内容，是否继续？",
                      )
                    ) {
                      void api<Revision>(
                        `/revision?path=${encodeURIComponent(actualPath)}&id=${item.id}`,
                      )
                        .then((revision) => {
                          setSource(revision.source);
                          notify("旧版本已载入编辑器，保存后才会替换当前草稿");
                        })
                        .catch((error) => notify(error.message, true));
                    }
                  }}
                >
                  版本 {item.revision}
                  <span>{formatTime(item.savedAt)}</span>
                </button>
              ))
            ) : (
              <p className="cms-help">
                保存草稿后生成版本记录。重新打开文章可查看。
              </p>
            )}
          </details>
          <Button
            variant="ghost"
            color="red"
            onClick={() => setDiscardDialog(true)}
          >
            丢弃草稿
          </Button>
          {initialPath && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm(
                    "重新载入会清除编辑器中的未保存修改，是否继续？",
                  )
                )
                  void load();
              }}
            >
              <ReloadIcon />
              重新载入
            </Button>
          )}
        </fieldset>
      </div>
      <Dialog.Root open={publishDialog} onOpenChange={setPublishDialog}>
        <Dialog.Content maxWidth="460px">
          <Dialog.Title>
            {session.mode === "local" ? "应用到本地博客" : "发布到博客"}
          </Dialog.Title>
          <Dialog.Description>
            {session.mode === "local"
              ? "将最新草稿写入本地 Markdown/MDX 文件。不会创建 Git 提交，也不会发布到 Cloudflare。"
              : "将最新草稿提交到 GitHub，触发 Cloudflare 构建。只有核对线上版本后，发布记录才显示已上线。"}
          </Dialog.Description>
          <p className="cms-dialog-path">{actualPath}</p>
          <p className="cms-help">
            操作会关闭该文章的 draft 字段，让它参与博客内容展示。
          </p>
          <div className="cms-dialog-actions">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                取消
              </Button>
            </Dialog.Close>
            <Button onClick={() => void publish()}>
              确认{session.mode === "local" ? "应用" : "发布"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
      <Dialog.Root open={discardDialog} onOpenChange={setDiscardDialog}>
        <Dialog.Content maxWidth="440px">
          <Dialog.Title>丢弃当前草稿？</Dialog.Title>
          <Dialog.Description>
            编辑器中未保存的修改也会被清除。文章源文件保持不变，已保存的历史版本仍然保留。
          </Dialog.Description>
          <div className="cms-dialog-actions">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                保留草稿
              </Button>
            </Dialog.Close>
            <Button color="red" onClick={() => void discard()}>
              丢弃草稿
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  );
}
