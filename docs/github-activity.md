# 首页日常积累

首页日历合并当年的 GitHub 贡献与站内文章、笔记、创作的首次发布日期。草稿、目录介绍、缺失日期及未来发布日期不计入。两类活动按日期叠加，统一显示每天的记录总数，不提供来源切换或分项统计。活跃天数按日期去重。

GitHub 数据直接读取 `Tsukikage7` 的官方公开贡献图，不使用第三方聚合 API，也不向浏览器提供访问令牌。贡献数遵循 GitHub 个人主页的统计口径，不等于所有仓库的原始 commit 数；可能包含用户在个人主页公开展示的匿名私有贡献数，不包含私有仓库详情。

同步脚本将经过完整日期覆盖和总数校验的数据保存为 `src/data/github-activity.json`。开发启动和构建命令自动同步，六小时内复用快照；网络或页面结构异常时保留旧快照，页面显示真实同步日期。若快照年份不匹配，显示待同步，不把缺失的 GitHub 数据当成零贡献。

```sh
pnpm run sync:github --force
pnpm exec tsx --test src/lib/activityCalendar.test.ts
node --test scripts/github-activity.test.mjs
```

站点是静态站点，线上数据更新需要重新构建并发布。单独运行同步脚本只更新本地数据文件。热力图直接渲染合并后的数据，不额外请求 GitHub，也不需要来源切换脚本。
