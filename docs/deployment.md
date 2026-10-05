# 生产发布

站点由 Astro 生成静态文件，发布到 Cloudflare Workers 的 `blog` 服务。`wrangler.jsonc` 固定账号和现有的两个自定义域名：`tsukikage7.com`、`www.tsukikage7.com`。规范地址统一使用 `https://tsukikage7.com`。

## 检查与发布

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm exec tsc --noEmit --incremental false
pnpm exec tsx --test src/lib/activityCalendar.test.ts src/lib/seriesModel.test.ts
node --test scripts/github-activity.test.mjs
pnpm exec wrangler whoami
pnpm exec wrangler deploy --dry-run
```

确认构建和检查通过后，将源码按功能提交并推送。若 `dist` 就是已经验证过的构建结果，可直接发布该产物，使用提交号记录版本来源：

```sh
pnpm exec wrangler deploy --message "release: <commit-sha>"
pnpm exec wrangler deployments status
```

日常也可用 `pnpm run deploy` 完成重新构建和部署；构建会按缓存规则同步 GitHub 贡献快照。GitHub 登录或 Cloudflare OAuth 凭据由本机工具保存，不进入仓库。`.env.production` 只提供浏览器可见的 `PUBLIC_` 配置。

## 线上核对

发布后检查正式域名的首页、技术文章、笔记、文学作品目录、章节前后跳转、合集与搜索。核对三份订阅源、站点地图、封面、字体、历史地址跳转与不存在路径的 404；HTTP 成功与 Worker 部署记录分别核对，浏览器另外确认页面和交互。

`dist`、Wrangler 工作目录、字体生成产物及 TypeScript 增量构建缓存不提交。开发与生产构建分别使用 Vite 缓存目录，生产构建可以与本地开发服务并行。
