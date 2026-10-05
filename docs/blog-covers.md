# 博客文章封面

文章封面使用技术主题图形：浅色纸面背景、蓝绿配色、左侧短标题和右侧结构图。图形围绕文章讨论的问题绘制，不使用人物或二次元插画。

现有 epoll 八篇、io_uring 与 Dubbo-Go Triple 的技术封面保持原样。其余九篇使用本地 SVG，保存在 `public/images/blog-covers/`，在文章的 `image` 字段中通过 `/images/blog-covers/<slug>.svg` 引用。首页、文章列表、分类页和详情页共用这一字段。

修改标题或图形后，在项目根目录重新生成：

```sh
node "scripts/build-blog-covers.mjs"
```

生成脚本共用尺寸、配色、字体和基本图形，每篇文章保留独立的主题图。SVG 中的文字由浏览器字体渲染，使用 PingFang SC、Noto Sans CJK SC、Microsoft YaHei 和系统无衬线字体作为回退。
