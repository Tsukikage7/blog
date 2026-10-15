# 博客图片存储

博客自有图片统一存放在 Cloudflare R2 的 `assets` 存储桶，公共域名为 `https://assets.tsukikage7.com`。页面、分享元数据和网站图标都使用远程地址。

| R2 目录 | 用途 | 本地编辑原稿 |
| --- | --- | --- |
| `blog/site/` | 头像、缩略图、网站图标及各尺寸头像 | `assets/images/site/` |
| `blog/cover/` | 技术文章封面，保留 SVG 或 WebP 格式 | `assets/images/blog-covers/`（SVG） |
| `blog/about/` | 学校、公司、开源项目标识 | `assets/images/about/` |
| `blog/technologies/` | 技术品牌标识 | `assets/images/technologies/` |
| `blog/writings/<slug>/` | 每篇文学作品的封面与插图 | `assets/images/writings/<slug>/` |

`assets/images/` 是编辑原稿目录，不属于站点公开目录，构建不会复制这些文件。品牌来源记录随原稿保留在 `assets/images/technologies/SOURCES.json`。音乐歌曲封面和评论访客头像由第三方服务动态提供，继续使用服务返回的地址。

## 页面引用

`src/lib/imageAssets.ts` 统一生成头像和技术品牌图片地址；文章 frontmatter 直接记录完整的远程图片 URL。

2026-10-10 迁移的图片使用 `?v=20261010b`，避免资源上传前的 404 缓存影响页面加载。替换图片时更新版本参数或使用新文件名，再同步修改页面引用。完整迁移清单、文件大小和 SHA-256 见 `docs/image-assets-manifest.json`。

头像原图和缩略图分别为 512 × 512、128 × 128。网站图标使用 16、32、180 像素版本；导航使用 32/64 像素，首页使用 240/480 像素，关于页使用 144/288 像素，后两者和导航均保留对应的 1x/2x `srcset`。

## 上传与验证

在项目根目录运行，将对象路径、文件路径和响应类型替换为实际值：

```sh
CLOUDFLARE_ACCOUNT_ID="f08770d5c92bef6310b2e5dbf2ac2286" \
  pnpm exec wrangler r2 object put "assets/blog/site/avatar.webp" \
  --file "assets/images/site/avatar.webp" \
  --content-type "image/webp" \
  --cache-control "public, max-age=86400" \
  --remote
```

SVG 使用 `image/svg+xml`，PNG 使用 `image/png`，ICO 使用 `image/x-icon`。上传后使用页面引用的完整 URL 检查 HTTP 200、响应类型、缓存设置和 SHA-256，再执行博客构建并检查浏览器实际加载。

技术封面通过 `node "scripts/build-blog-covers.mjs"` 生成，输出到原稿目录，生成后单独上传到 R2。文学图片的具体清单见 [创作图片存储说明](writings-assets.md)。

图片上传和博客发布是两个独立步骤。上传后图片可用，引用修改需随博客发布上线。
