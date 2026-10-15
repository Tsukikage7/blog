import React, { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { splitSource } from "../../cms/content";

export default function Preview({ source }: { source: string }) {
  const root = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    try {
      const parsed = splitSource(source);
      setTitle(String(parsed.data.title || ""));
      setError("");
      const renderer = new marked.Renderer();
      renderer.code = ({ text, lang }) =>
        lang === "mermaid"
          ? `<pre class="cms-mermaid">${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`
          : `<pre><code>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>`;
      const markup = marked.parse(parsed.body, { renderer, async: false });
      setHtml(
        DOMPurify.sanitize(markup, {
          FORBID_TAGS: ["style", "iframe", "form", "input", "button"],
          FORBID_ATTR: ["style", "srcset"],
        }),
      );
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "暂时无法预览");
    }
  }, [source]);
  useEffect(() => {
    let cancelled = false;
    const element = root.current;
    if (!element) return;
    for (const link of element.querySelectorAll("a")) {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    const diagrams = Array.from(
      element.querySelectorAll<HTMLElement>(".cms-mermaid"),
    );
    if (diagrams.length)
      void (async () => {
        try {
          const { default: mermaid } = await import("mermaid");
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            theme: "neutral",
            suppressErrorRendering: true,
          });
          for (const diagram of diagrams) {
            const result = await mermaid.render(
              `cms-diagram-${crypto.randomUUID()}`,
              diagram.textContent || "",
            );
            if (cancelled) return;
            diagram.innerHTML = DOMPurify.sanitize(result.svg, {
              USE_PROFILES: { svg: true, svgFilters: true },
            });
          }
        } catch {
          if (!cancelled)
            setError("部分 Mermaid 图表无法预览，请检查图表语法。");
        }
      })();
    // KaTeX 自动渲染只处理文本，不执行 MDX 的 JavaScript。
    void (async () => {
      try {
        const { default: renderMath } =
          await import("katex/contrib/auto-render");
        if (!cancelled)
          renderMath(element, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "$", right: "$", display: false },
            ],
            throwOnError: false,
            trust: false,
          });
      } catch {
        /* 普通 Markdown 预览仍然可用。 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [html]);
  return (
    <div className="cms-preview-wrap">
      <p className="cms-preview-note">
        Markdown 预览 · 自定义 MDX 组件保留源码，最终效果以博客构建为准
      </p>
      {error && (
        <p role="alert" className="cms-inline-error">
          {error}
        </p>
      )}
      <article className="cms-preview">
        <h1>{title}</h1>
        <div ref={root} dangerouslySetInnerHTML={{ __html: html }} />
      </article>
    </div>
  );
}
