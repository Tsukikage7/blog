# 博客管理

本项目自己的 CMS，使用现有 Astro、React、TypeScript 技术栈。界面使用 Radix Themes，编辑器使用 CodeMirror。参考 Keystatic 和 Decap CMS 的 Git 内容管理方式，不依赖它们的托管服务，也没有复制其实现代码。

## 本地使用

要求 Node.js >= 22.13（SQLite API）。启动现有开发服务：

```sh
pnpm dev
```

打开 `http://127.0.0.1:4321/admin/`。开发服务的管理界面和 API 只允许本机请求；不要通过反向代理把无登录的本地模式暴露到外网。

- 内容管理：文章、创作、笔记、合集、分类与标签，以及关于、首页、社交、搜索、条款等页面。
- 编辑：完整 Markdown/MDX 源码、常用字段、Markdown 阅读预览、Mermaid 与数学公式预览。已有 YAML 注释、未知字段和 MDX 正文保留。
- 草稿：停笔约 1.8 秒自动保存，也支持手动保存和 Cmd/Ctrl+S。存放于 `.cms/state.sqlite`，不改源文件。每篇保留历史版本，界面显示最近 30 个。
- 应用到本地：校验真实内容 schema、合集与章节顺序后，写入对应 `src/content` 文件，关闭 `draft`。不会自动执行 Git 或线上部署。
- 媒体：PNG/JPEG/GIF/WebP，单张最大 8 MiB，本地保存在 `public/images/cms/`。支持图片列表、复制地址、插入文末。
- 发布记录：保留提交快照，可恢复为草稿；当前草稿不会被恢复操作覆盖。

备份 `.cms/state.sqlite` 时先停止开发服务，或使用 SQLite 备份工具；运行中的 WAL 数据不应只复制主数据库文件。`.cms/` 已忽略，不会进入 Git。

MDX 自定义组件不会在管理界面执行，最终效果以博客页面和 Astro 构建为准。简历等复杂扩展字段仍在完整源码中编辑。第一版没有发布文章删除、定时发布或多人权限分级。

## Cloudflare 部署结构

公开博客继续由原来的 `wrangler.jsonc` 静态部署。CMS 使用独立的 `wrangler.cms.jsonc`，同一份前端产物，但管理 API 在单独 Worker `blog-cms` 上运行。建议后台使用 `cms.tsukikage7.com/admin/`，博客仍用原域名。

线上流程：

```text
Access 登录 → CMS 编辑 → D1 草稿与历史
                       → R2 媒体
发布 → GitHub 分支提交 → Cloudflare Workers Builds → 博客线上版本核对
统计 → Worker 服务端查询 Cloudflare GraphQL / Builds API
```

CMS 本身不启动构建命令：必须先在公开博客 Worker 的设置中连接 GitHub 仓库与发布分支，配置构建 `pnpm run build`、部署 `pnpm exec wrangler deploy`，并保证该分支的提交会触发构建。后台代码更新也需单独重新部署 CMS Worker。

### 首次配置

以下命令是部署准备说明；不会因打开文档而执行。

1. 创建 D1 数据库并把返回的 `database_id` 加到 `wrangler.cms.jsonc` 的 `d1_databases[0]`：

   ```sh
   pnpm exec wrangler d1 create blog-cms --config "wrangler.cms.jsonc"
   pnpm run cms:migrate:remote
   ```

2. 检查 `CMS_GITHUB_REPO`、`CMS_GITHUB_BRANCH`、`CMS_SITE_URL`、账户 ID、Web Analytics siteTag。R2 默认复用 `assets` 桶，CMS 图片只写 `blog/cms/images/` 前缀。`CMS_MEDIA_URL` 必须是该桶实际可访问的公开域名。

3. 在 Cloudflare Zero Trust 为整个后台域名创建 Access Self-hosted 应用。允许指定邮箱，填入 `CMS_ACCESS_TEAM_DOMAIN`（例如 `your-team.cloudflareaccess.com`，不含协议）、应用 AUD 和逗号分隔的 `CMS_ALLOWED_EMAILS`。Worker 除校验 Access JWT 的签名、issuer、audience、有效期外，还核对邮箱白名单；缺配置时拒绝管理访问。

4. 设置仅服务端使用的 secrets：

   ```sh
   pnpm exec wrangler secret put CMS_GITHUB_TOKEN --config "wrangler.cms.jsonc"
   pnpm exec wrangler secret put CLOUDFLARE_ANALYTICS_TOKEN --config "wrangler.cms.jsonc"
   pnpm exec wrangler secret put CLOUDFLARE_BUILD_TOKEN --config "wrangler.cms.jsonc"
   ```

   GitHub 使用仅限本博客仓库的 fine-grained token，Contents Read and Write。分支保护如果禁止直接提交，需要调整发布流程；当前版本会保留草稿并提示请求被拒绝，不绕过分支规则。

   统计 token 需要目标账户的 Account Analytics Read 权限。Builds 查询使用单独的 user-scoped token，授予 Workers Builds Configuration Read 和 Workers Scripts Read；本项目只查询构建，不触发或修改构建，已在线验证这两项只读权限足够。不要把任何 token 放在 `PUBLIC_` 环境变量、前端代码或 Git 中。

5. 部署 CMS，之后绑定后台自定义域名。正式使用前核对该域名确实由 Access 保护、邮箱可以登录、API 不能匿名访问：

   ```sh
   pnpm run cms:deploy
   ```

Access 配置为空时 Worker 主动锁定 `/admin` 和管理 API。公开博客的静态 `/admin/` 页面没有管理 API，不能用于线上编辑；使用 CMS Worker 的域名。

### 发布结果与恢复

发布从单个 Git 提交快照读取并校验内容，Git Data API 创建新提交，再以 `force: false` 更新分支。文件内容或分支在期间变化会阻止覆盖，需载入并合并。草稿保存也使用版本号检测另一窗口的修改。

`pnpm run build` 会生成 `cms-release.json`，只包含 Git 提交标识、构建时间与内容 SHA-256 摘要。后台同时核对该文章摘要和对应提交（或包含该提交的后续线上提交），才标记“已上线”。HTTP 200 或构建成功本身不足以确认上线。

网络中断导致提交结果未知时，发布记录保持“提交中”，刷新会通过提交消息中的 CMS 任务标识查询结果，不自动重试提交。若长期查不到对应提交，先人工检查 GitHub 分支记录与 token，再处理该任务；第一版没有自动取消未知结果任务。构建失败的快照可在发布记录恢复为草稿。

## 访问与运维统计

访问统计限定 `CMS_SITE_URL` 的域名及其 `www` 别名，避免同一个 Web Analytics 站点采集到其他子域名时混入博客指标。Worker 请求数统计的是 `CMS_CF_WORKER_NAME` 的脚本调用；静态资源直接由 Cloudflare 提供时可能不调用脚本，因此该数值不是博客的全部 HTTP 请求量。

访问统计包括页面浏览量、访问次数、每日趋势、国家/地区、热门路径、来源与设备；运维指标包括博客 Worker 请求数和错误数。访问次数不是精确独立人数，统计有采样与延迟，并受浏览器脚本阻止等因素影响。地区是国家/地区维度，第一版不提供城市定位。

博客须正常启用 Cloudflare Web Analytics beacon。后台数据来自真实 API，缺凭据会显示“待连接”，请求或权限错误会显示具体状态；不会用虚构曲线或零值冒充已接通。

本地想查询线上统计，可复制 `.env.local.example` 为 `.env.local` 并填写只读统计 token，重启开发服务。模拟线上 Worker 可复制 `.dev.vars.example` 为 `.dev.vars`；模拟模式也需要真实有效的 Access JWT，日常编辑用 Astro 本地模式。

## 检查与维护

### 当前线上配置（2026-10-10）

- 入口：`https://cms.tsukikage7.com/admin/`，独立 Worker `blog-cms`；`workers.dev` 与预览地址均关闭。
- Access：`Tsukikage 博客管理`，仅允许 `chongyanovo@gmail.com` 通过邮箱验证码登录，会话 24 小时；Worker 同时校验 JWT 和邮箱。
- D1：`blog-cms`，ID `0275ff7f-d7be-497d-b717-3b95e83f395f`，已执行 `0001_cms.sql` 和 `0002_draft_history.sql`。
- R2：复用 `assets`，CMS 写入前缀 `blog/cms/images/`，公开域名 `https://assets.tsukikage7.com`。
- Web Analytics：站点 `90dd0c6ff43546d2b60f629621764bb2`，只查询 `tsukikage7.com` 和 `www.tsukikage7.com`。
- 已配置 Secret：`CMS_GITHUB_TOKEN`、`CLOUDFLARE_ANALYTICS_TOKEN`、`CLOUDFLARE_BUILD_TOKEN`。
- GitHub：fine-grained token `blog-cms-content`，不设到期时间，仅授权 `Tsukikage7/blog` 的 Contents Read and Write 与必需的 Metadata Read；不授予账户权限。凭据仅保存在 Worker Secret，可在 GitHub 个人访问令牌设置中撤销。
- Cloudflare：两枚专用令牌均仅限 `TsukiKage` 账户、只读、不设到期时间；可在 Cloudflare 用户 API 令牌页面撤销。
- 日志：Observability 和持久化调用日志开启，采样率 1；Traces 关闭。
- 实际验证：Access 登录后统计页面显示真实数据；匿名管理页面和 API 跳转 Access 登录；专用只读令牌可查询博客构建记录。GitHub 内容列表成功读取 `main` 的 34 项内容，`io-uring.md` 的编辑器载入源码、元数据与阅读预览；列表和文章接口均返回 200，运行时无异常。连接设置显示五项集成配置就绪。
- GitHub 接通时修复 Workers 全局 `fetch` 的调用上下文错误，并增加回归测试。后台修复版本：`f7eb1993-3d90-48ad-812d-024ad10b2f79`。
- 发布验证：CMS 实现和发布摘要生成逻辑尚未提交到发布分支，完整的提交、自动构建与“已上线”判定流程仍待验证。内容读取已接通，不代表发布流程已验收。

公开博客已连接 `Tsukikage7/blog` 的 `main` 分支，构建命令 `pnpm run build`，生产部署命令 `npx wrangler deploy --name blog`。CMS 更新仍需单独执行 `pnpm run cms:deploy`。

```sh
pnpm run cms:test
pnpm exec tsc --noEmit --incremental false
pnpm run build
pnpm run cms:types
pnpm run cms:migrate:local
pnpm exec wrangler deploy --dry-run --config "wrangler.cms.jsonc"
```

数据库变更新增迁移，不修改已执行迁移；D1 远程迁移与正式部署前保留备份。当前 GitHub 内容列表逐文件读取，适合个人博客；文章规模显著扩大时应增加内容索引与缓存，并结合 Worker 限额检查，避免重复全库读取。

本地源码、线上 GitHub、D1 草稿是不同状态。本地改动必须经过你已有的 Git/部署流程后才进入线上；线上发布提交拉取回来后才会出现在本地。上线前先把这次 CMS 实现提交到发布分支，否则线上构建缺少发布摘要生成逻辑。

## 参考

- [Keystatic GitHub 模式](https://keystatic.com/docs/github-mode)：文件内容管理与 Git 发布模式。
- [Decap CMS](https://github.com/decaporg/decap-cms)：集合配置、编辑、媒体与发布工作流。
- [GitHub Git refs API](https://docs.github.com/en/rest/git/refs#update-a-reference)：非强制分支更新。
- [Cloudflare Access JWT 验证](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)：管理入口鉴权。
- [Cloudflare Workers Builds API](https://developers.cloudflare.com/workers/ci-cd/builds/api-reference/)：构建状态查询与权限。
- [Cloudflare Web Analytics 维度](https://developers.cloudflare.com/web-analytics/data-metrics/dimensions/)和 [Workers 统计查询](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/)：统计来源与指标含义。
