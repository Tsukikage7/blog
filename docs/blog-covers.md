# 博客文章封面

文章封面使用技术主题图形：浅色纸面背景、蓝绿配色、左侧短标题和右侧结构图。图形围绕文章讨论的问题绘制，不使用人物或二次元插画。

所有技术文章封面通过 Cloudflare R2 资源域名加载。现有 epoll 八篇、io_uring 与 Dubbo-Go Triple 使用 WebP；其余九篇使用 SVG，原稿保存在 `assets/images/blog-covers/`，文章的 `image` 字段引用 `https://assets.tsukikage7.com/blog/cover/<slug>.svg`。首页、文章列表、分类页和详情页共用这一字段。

修改标题或图形后，在项目根目录重新生成：

```sh
node "scripts/build-blog-covers.mjs"
```

生成脚本共用尺寸、配色、字体和基本图形，每篇文章保留独立的主题图。SVG 中的文字由浏览器字体渲染，使用 PingFang SC、Noto Sans CJK SC、Microsoft YaHei 和系统无衬线字体作为回退。

重新生成后需上传到 R2 并验证，再发布引用这些图片的页面。存储目录和上传步骤见 [图片存储说明](image-assets.md)。
