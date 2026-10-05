import { slug } from "github-slugger";
import { marked } from "marked";

marked.use({
  gfm: true, 
  breaks: true, 
  pedantic: false,
});

const renderer = new marked.Renderer();

renderer.heading = function({ text, depth, tokens }) {
  const escapedText = slug(text);
  return `<h${depth} id="${escapedText}">
    <a href="#${escapedText}" class="anchor-link">${this.parser.parseInline(tokens)}</a>
  </h${depth}>`;
};

const escapeHtml = (text: string) => text
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

renderer.code = function({ text: code, lang: language }) {
  const validLang = language && language !== '' ? language : 'text';
  return `<div class="code-block-wrapper">
    <div class="code-block-header">
      <span class="code-language">${escapeHtml(validLang)}</span>
      <button class="copy-code-btn" onclick="copyCode(this)" title="复制代码">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
      </button>
    </div>
    <pre><code class="language-${escapeHtml(validLang)}">${escapeHtml(code)}</code></pre>
  </div>`;
};

const renderTable = renderer.table;
renderer.table = function(table) {
  return `<div class="table-wrapper">
    ${renderTable.call(this, table).replace("<table>", '<table class="markdown-table">')}
  </div>`;
};

renderer.link = function({ href, title, tokens }) {
  
  const isExternal = href.startsWith('http://') || href.startsWith('https://');
  const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  return `<a href="${escapeHtml(href)}"${titleAttr}${target}>${this.parser.parseInline(tokens)}</a>`;
};

renderer.image = function({ href, title, text }) {
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
  return `<figure class="markdown-image">
    <img src="${escapeHtml(href)}" alt="${escapeHtml(text)}"${titleAttr} loading="lazy" class="responsive-image" />
    ${text ? `<figcaption>${escapeHtml(text)}</figcaption>` : ''}
  </figure>`;
};

renderer.blockquote = function({ tokens }) {
  return `<blockquote class="markdown-blockquote">${this.parser.parse(tokens)}</blockquote>`;
};

marked.setOptions({ renderer });

export const slugify = (content: string) => {
  if (!content) return '';
  return slug(content.toString());
};

export const markdownify = (content: string, div?: boolean) => {
  const options = { renderer, async: false as const };
  
  return div ? marked.parse(content, options) : marked.parseInline(content, options);
};

async function extractImageUrls(content: string): Promise<string> {
  const regex = /!\[.*?\]\((.*?)\)/g;
  const matches = content.match(regex);
  if (matches) {
    matches.forEach(match => {
      const url = match.match(/\((.*?)\)/)?.[1];
      console.log("图片URL",url)
      if (url) {
        content = content.replace(url, transformImageUrl(url));
      }
    });
  }
  console.log("替换后的文章内容",content)
  return content;
}

function transformImageUrl(url: string): string {
  if (url.indexOf("/_image?href=") !== -1) {
    return url;
  }
  return `/_image?href=${encodeURI(url)}`;
}

export const upperHumanize = (content: string | undefined) => {
  if (!content) return '';
  return content
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/(^\w{1})|(\s{1}\w{1})/g, (match) => match.toUpperCase());
};

export const lowerHumanize = (content: string | undefined) => {
  if (!content) return '';
  return content
    .toLowerCase()
    .replace(/-/g, " ");
};

export const plainify = (content: string) => {
  const parseMarkdown = marked.parse(content, { async: false });
  const filterBrackets = parseMarkdown.replace(/<\/?[^>]+(>|$)/gm, "");
  const filterSpaces = filterBrackets.replace(/[\r\n]\s*[\r\n]/gm, "");
  const stripHTML = htmlEntityDecoder(filterSpaces);
  return stripHTML;
};

const htmlEntityDecoder = (htmlWithEntities: string) => {
  let entityList: { [key: string]: string } = {
    "&nbsp;": " ",
    "&lt;": "<",
    "&gt;": ">",
    "&amp;": "&",
    "&quot;": '"',
    "&#39;": "'",
  };
  let htmlWithoutEntities: string = htmlWithEntities.replace(
    /(&amp;|&lt;|&gt;|&quot;|&#39;)/g,
    (entity: string): string => {
      return entityList[entity];
    },
  );
  return htmlWithoutEntities;
};
