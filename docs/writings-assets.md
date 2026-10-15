# 创作图片存储

小说封面和正文插图存放在 Cloudflare R2 的 `assets` 存储桶，通过 `https://assets.tsukikage7.com` 访问。每篇作品使用独立目录 `blog/writings/<slug>/`，技术文章封面继续使用现有的 `blog/cover/` 目录。

## 《合照里没有下雨》

- 文章：`src/content/writings/he-zhao-li-mei-you-xia-yu.md`
- 本地编辑原稿：`assets/images/writings/he-zhao-li-mei-you-xia-yu/`
- R2 目录：`assets/blog/writings/he-zhao-li-mei-you-xia-yu/`
- 公共地址前缀：`https://assets.tsukikage7.com/blog/writings/he-zhao-li-mei-you-xia-yu/`
- 图片格式：WebP，尺寸均为 1448 × 1086。
- 响应类型：`image/webp`；缓存：`public, max-age=86400`。

| 文件 | 画面 | 大小（字节） |
| --- | --- | ---: |
| `cover.webp` | 晴天毕业合照 | 152854 |
| `01-tailor-shop.webp` | 裁缝铺 | 193466 |
| `02-shared-umbrella.webp` | 雨中共伞 | 252552 |
| `03-blue-thread.webp` | 蓝线缝扣子 | 173458 |
| `04-summer-distance.webp` | 夏日的距离 | 287222 |
| `05-station-farewell.webp` | 车站告别 | 231608 |
| `06-night-train.webp` | 夜行列车 | 158050 |

文章 frontmatter 的 `image` 和正文 `<img src>` 均直接引用公共地址。正文保留图片宽高，封面优先加载，其余插图按需加载。

## 上传与替换

在项目根目录运行，将本地文件路径和作品文件名替换为实际值：

```sh
CLOUDFLARE_ACCOUNT_ID="f08770d5c92bef6310b2e5dbf2ac2286" \
  pnpm exec wrangler r2 object put \
  "assets/blog/writings/he-zhao-li-mei-you-xia-yu/cover.webp" \
  --file "/path/to/cover.webp" \
  --content-type "image/webp" \
  --cache-control "public, max-age=86400" \
  --remote
```

`--remote` 用于上传到线上存储桶。上传后检查公共地址返回 200、响应类型和缓存设置，并核对远程文件与本地文件的 SHA-256。替换已使用的图片时，优先使用新文件名并更新文章地址，避免缓存继续展示旧图。

图片上传与博客发布独立：上传后资源地址立即可用，文章地址变更需随博客正常发布流程上线。
