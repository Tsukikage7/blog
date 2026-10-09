# 维护合集与文学作品

合集与文学作品共享章节模型，由 Markdown 元数据定义归属和顺序。当前有 epoll 技术合集（8 篇），暂无文学作品。

## 技术合集

在 `src/content/series/` 创建定义，例如 `epoll.md`：

```yaml
title: epoll：从原理到实战
kind: technical
description: 合集介绍
audience: 适合的读者
prerequisites: 阅读前需要了解的概念
```

`kind` 默认 technical。博客文章和技术笔记均可作为章节：

```yaml
series: epoll
seriesOrder: 1
```

目录地址为 `/series/epoll/`，正文仍使用 `/blog/` 与 `/notes/` 的原地址。

## 文学作品

以下为新增作品的配置示例，当前没有对应的已发表作品。作品定义也放在 `src/content/series/`，例如 `example-novel.md`：

```yaml
title: 示例小说
kind: literary
genre: 小说
description: 作品简介
```

章节属于 writings，填写相同的作品标识和顺序：

```yaml
genre: 小说
series: example-novel
seriesOrder: 1
chapterTitle: 第一章
```

目录地址为 `/writings/works/example-novel/`。章节原地址保留，`chapterTitle` 只控制目录及章节阅读页标题，未设置时使用正文标题。独立散文、随笔或诗歌不需要 series 字段。

## 校验与展示

序号必须为正整数，并在同一合集内唯一；不要求连续，方便暂存草稿。技术合集与文学作品不能混用正文类型。未知归属、缺失配对字段及重复序号会阻止构建。合集介绍不维护第二份章节清单。

目录、阅读进度和前后章节从公开正文自动生成。草稿正文不进入目录，也不影响作品更新时间。空合集和草稿合集不展示入口；如需隐藏正文，也应把对应章节设为草稿。最后一章仅表示当前已发表章节的边界，不等于作品完结。

首页将合集及作品的章节聚合成一个入口，「最近发布」按最新公开章节的发布日期排序和展示；合集目录的「更新于」仍取定义和公开章节的最新更新时间。创作列表、创作标签页和分页也按作品聚合；技术归档、搜索与订阅仍能访问每篇/每章正文。搜索同时收录合集与作品介绍。

订阅范围：

- `/rss.xml`：技术文章，保留原订阅地址。
- `/writings/rss.xml`：创作正文，小说按章更新。
- `/feed.xml`：技术文章、笔记与创作正文。

验证：`pnpm exec tsx --test src/lib/seriesModel.test.ts`，然后 `pnpm run build`。模型测试覆盖文学顺序、跨集合文件同名、作品聚合、草稿筛选和类型混用。
