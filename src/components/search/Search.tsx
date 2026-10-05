import type { SearchDocument } from "@/types/search";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Fuse from "fuse.js";

function Highlight({ text, query }: { text: string; query: string }) {
  const term = query.trim();
  const index = term
    ? text.toLocaleLowerCase().indexOf(term.toLocaleLowerCase())
    : -1;
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded-sm bg-primary/15 px-0.5 text-foreground">
        {text.slice(index, index + term.length)}
      </mark>
      {text.slice(index + term.length)}
    </>
  );
}

function excerpt(text: string, query: string) {
  const index = text
    .toLocaleLowerCase()
    .indexOf(query.trim().toLocaleLowerCase());
  if (index < 0 || index < 90) return text.slice(0, 180);
  return `…${text.slice(index - 70, index + 110)}…`;
}

const SearchPage = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputVal, setInputVal] = useState("");
  const [documents, setDocuments] = useState<SearchDocument[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [attempt, setAttempt] = useState(0);
  const [initialized, setInitialized] = useState(false);

  const handleChange = (e: React.FormEvent<HTMLInputElement>) =>
    setInputVal(e.currentTarget.value);
  const fuse = useMemo(
    () =>
      new Fuse(documents, {
        keys: [
          { name: "title", weight: 3 },
          { name: "description", weight: 2 },
          "url",
          "text",
        ],
        ignoreLocation: true,
        minMatchCharLength: 2,
        threshold: 0.5,
      }),
    [documents],
  );
  const query = inputVal.trim();
  const searchResults = useMemo(
    () => (query.length >= 2 ? fuse.search(query) : []),
    [query, fuse],
  );

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("q") || "";
    setInputVal(query);
    setInitialized(true);
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setStatus("loading");
    fetch("/api/search-index.json", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("索引加载失败");
        const data: SearchDocument[] = await response.json();
        if (!Array.isArray(data)) throw new Error("索引格式错误");
        setDocuments(data);
        setStatus("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus("error");
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (!initialized) return;
    const url = new URL(window.location.href);
    if (inputVal.trim()) url.searchParams.set("q", inputVal);
    else url.searchParams.delete("q");
    history.replaceState(history.state, "", url.pathname + url.search);
  }, [inputVal, initialized]);

  return (
    <section className="border-t border-border pt-8 pb-10">
      <div className="max-w-3xl">
        <div className="mb-5">
          <input
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="搜索标题或正文，例如：epoll、Go、Spark"
            type="search"
            name="search"
            aria-label="搜点什么"
            value={inputVal}
            onChange={handleChange}
            autoComplete="off"
            ref={inputRef}
          />
        </div>
        <div
          className="mb-3 flex min-h-6 items-center text-sm text-muted-foreground"
          aria-live="polite"
          aria-busy={status === "loading"}
        >
          <span>
            {status === "loading"
              ? "正在加载索引…"
              : status === "ready" && query.length >= 2
                ? `找到 ${searchResults.length} 条结果`
                : query.length < 2
                  ? "输入至少 2 个字符开始搜索"
                  : ""}
          </span>
        </div>
        {status === "error" ? (
          <div className="rounded-lg border border-border bg-card p-6 text-center">
            <p className="text-sm text-foreground">搜索索引暂时无法加载</p>
            <button
              type="button"
              className="mt-3 rounded-md px-3 py-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => setAttempt((value) => value + 1)}
            >
              重试
            </button>
          </div>
        ) : status === "loading" ? (
          <div className="space-y-3" aria-label="搜索结果加载中">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-24 animate-pulse rounded-lg border border-border/60 bg-muted/40"
              />
            ))}
          </div>
        ) : query.length < 2 ? (
          <div className="border-b border-border/60 py-12 text-center text-sm text-muted-foreground">
            从文章标题或主题开始搜索。
          </div>
        ) : searchResults.length === 0 ? (
          <div className="border-b border-border/60 py-12 text-center">
            <p className="font-medium text-foreground">没有找到匹配内容</p>
            <p className="mt-1 text-sm text-muted-foreground">
              试试更短或不同的关键词。
            </p>
          </div>
        ) : (
          <ol className="divide-y divide-border/70 border-y border-border/70">
            {searchResults.map(({ item }) => (
              <li className="py-6" key={item.url}>
                <article>
                  <h2 className="text-lg font-semibold text-foreground">
                    <a
                      className="rounded-sm decoration-primary decoration-2 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      href={item.url}
                    >
                      <Highlight text={item.title} query={query} />
                    </a>
                  </h2>
                  {item.description && (
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      <Highlight text={item.description} query={query} />
                    </p>
                  )}
                  {item.text && (
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">
                      <Highlight
                        text={excerpt(item.text, query)}
                        query={query}
                      />
                    </p>
                  )}
                  {item.created && (
                    <time
                      className="mt-2 block text-xs tabular-nums text-muted-foreground/80"
                      dateTime={item.created}
                    >
                      {new Date(item.created).toLocaleDateString("zh-CN")}
                    </time>
                  )}
                </article>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
};

export default SearchPage;
