import mdx from "@astrojs/mdx";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { unified } from "@astrojs/markdown-remark";
import AutoImport from "astro-auto-import";
import { defineConfig } from "astro/config";
import remarkCollapse from "remark-collapse";
import remarkToc from "remark-toc";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import rehypeExternalLinks from "rehype-external-links";
import { remarkMermaid } from "./src/lib/remarkMermaid.js";
import { remarkContentHeadings } from "./src/lib/remarkContentHeadings.ts";
import { SITE_URL } from "./src/lib/site.ts";

import os from "node:os";

// 获取环境变量
const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";
// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  base: "/",
  trailingSlash: "always",
  compressHTML: true,
  output: "static",
  // 整理分类和标签后，旧入口仍可跳转到对应的新目录。
  redirects: {
    "/blog/scala-actor-concurrency-model/": "/blog/async-task-ordering/",
    "/blog/akka-simple-spark-communication-framework/":
      "/blog/task-lease-fencing/",
    "/blog/3/": "/blog/",
    "/blog/4/": "/blog/",
    "/blog/5/": "/blog/",
    "/blog/binary-search/": "/notes/",
    "/blog/bytedance-data-dev-interview-review/": "/notes/",
    "/blog/categories/后端开发/": "/blog/",
    "/blog/categories/工具/": "/blog/categories/开发工具/",
    "/blog/categories/技术/": "/notes/",
    "/blog/categories/数据库/": "/blog/",
    "/blog/categories/数据开发/": "/blog/categories/数据工程/",
    "/blog/categories/算法/": "/blog/",
    "/blog/categories/算法与数据结构/": "/blog/",
    "/blog/categories/编程语言/": "/blog/categories/",
    "/blog/categories/部署/": "/notes/",
    "/blog/categories/部署运维/": "/notes/",
    "/blog/categories/面试/": "/series/",
    "/blog/centos-docker-installation/": "/notes/centos-docker-installation/",
    "/blog/centos-kubernetes-installation/":
      "/notes/centos-kubernetes-installation/",
    "/blog/centos-mysql-installation/": "/notes/",
    "/blog/docker-compose-clickhouse-standalone/":
      "/notes/docker-compose-service-notes/",
    "/blog/docker-compose-kafka-standalone/":
      "/notes/docker-compose-service-notes/",
    "/blog/docker-umami-setup/": "/notes/docker-compose-service-notes/",
    "/blog/git-version-control/": "/notes/git-version-control/",
    "/blog/hadoop-interview-questions/": "/notes/",
    "/blog/hashmap-and-collections-differences/": "/blog/java-map-selection/",
    "/blog/hashmap-implementation/": "/blog/java-map-selection/",
    "/blog/index-usage-notes/": "/blog/",
    "/blog/java-io-streams/": "/notes/",
    "/blog/juc-interview-questions/": "/blog/",
    "/blog/majority-element-1/": "/blog/",
    "/blog/majority-element-2/": "/blog/",
    "/blog/majority-vote/": "/blog/",
    "/blog/merge-two-sorted-lists/": "/notes/",
    "/blog/mysql-index-guide/": "/blog/",
    "/blog/mysql-indexes/": "/blog/",
    "/blog/mysql-performance-analysis/": "/blog/",
    "/blog/mysql-query-diagnosis/": "/blog/",
    "/blog/mysql-transactions/": "/blog/",
    "/blog/nio-algorithm-interview-review/": "/notes/",
    "/blog/palindrome-number/": "/notes/",
    "/blog/scala-generics/": "/notes/",
    "/blog/scala-higher-order-functions/": "/notes/",
    "/blog/scala-partial-functions/": "/notes/",
    "/blog/scala-pattern-matching/": "/notes/",
    "/blog/sorting-algorithms/": "/blog/",
    "/blog/spark-interview-questions/": "/blog/spark-shuffle-skew/",
    "/blog/sql-optimization/": "/blog/",
    "/blog/tags/akka/": "/blog/tags/pekko/",
    "/blog/tags/centos/": "/notes/tags/centos/",
    "/blog/tags/clickhouse/": "/notes/",
    "/blog/tags/docker-compose/": "/notes/tags/docker-compose/",
    "/blog/tags/docker/": "/notes/tags/docker/",
    "/blog/tags/dockercompose/": "/notes/tags/docker-compose/",
    "/blog/tags/git/": "/notes/tags/git/",
    "/blog/tags/golang/": "/blog/tags/go/",
    "/blog/tags/goroutine/": "/blog/tags/go/",
    "/blog/tags/hadoop/": "/notes/",
    "/blog/tags/hive/": "/notes/",
    "/blog/tags/io多路复用/": "/blog/tags/io-多路复用/",
    "/blog/tags/kafka/": "/notes/",
    "/blog/tags/kubernetes/": "/notes/tags/kubernetes/",
    "/blog/tags/leetcode/": "/blog/",
    "/blog/tags/mysql/": "/blog/",
    "/blog/tags/shell/": "/notes/",
    "/blog/tags/sql/": "/blog/",
    "/blog/tags/ubuntu/": "/notes/",
    "/blog/tags/umami/": "/notes/",
    "/blog/tags/wire/": "/blog/tags/go/",
    "/blog/tags/事务/": "/blog/",
    "/blog/tags/内核源码/": "/series/epoll/",
    "/blog/tags/函数式编程/": "/notes/",
    "/blog/tags/博客/": "/notes/",
    "/blog/tags/实战案例/": "/series/epoll/",
    "/blog/tags/并发/": "/blog/categories/并发编程/",
    "/blog/tags/并发编程/": "/blog/categories/并发编程/",
    "/blog/tags/分布式系统/": "/blog/categories/分布式系统/",
    "/blog/tags/开发/": "/blog/",
    "/blog/tags/微服务/": "/blog/tags/rpc/",
    "/blog/tags/数据结构/": "/blog/tags/java/",
    "/blog/tags/泛型/": "/notes/",
    "/blog/tags/算法/": "/blog/",
    "/blog/tags/部署/": "/notes/",
    "/blog/tags/集合/": "/blog/tags/java/",
    "/blog/tags/面试/": "/blog/",
    "/blog/two-sum/": "/notes/",
    "/blog/valid-parentheses/": "/notes/",
    "/notes/algorithm-basics/": "/notes/",
    "/notes/big-data-cluster-scripts/": "/blog/big-data-cluster-scripts/",
    "/notes/bytedance-data-dev-interview-review/": "/notes/",
    "/notes/centos-mysql-installation/": "/notes/",
    "/notes/data-warehouse-layering/": "/blog/data-warehouse-layering/",
    "/notes/hadoop-interview-questions/": "/notes/",
    "/notes/java-io-streams/": "/notes/",
    "/notes/nio-algorithm-interview-review/": "/notes/",
    "/notes/scala-language-notes/": "/notes/",
    "/notes/spark-rdd-execution/": "/blog/spark-shuffle-skew/",
    "/notes/tags/hadoop/": "/notes/",
    "/notes/tags/hive/": "/notes/",
    "/notes/tags/io/": "/notes/",
    "/notes/tags/java/": "/notes/",
    "/notes/tags/leetcode/": "/notes/",
    "/notes/tags/mysql/": "/notes/",
    "/notes/tags/scala/": "/notes/",
    "/notes/tags/shell/": "/notes/",
    "/notes/tags/spark/": "/blog/tags/spark/",
    "/notes/tags/sql/": "/notes/",
    "/notes/tags/ubuntu/": "/notes/",
    "/notes/tags/函数式编程/": "/notes/",
    "/notes/tags/算法/": "/notes/",
    "/notes/tags/面试/": "/notes/",
    "/series/algorithms/": "/series/",
    "/series/docker/": "/notes/docker-compose-service-notes/",
    "/series/interviews/": "/series/",
    "/series/mysql/": "/series/",
    "/series/scala/": "/notes/",
  },
  server: {
    // 允许通过本机IP访问开发服务器
    host: true, // 或者使用 '0.0.0.0'
    port: 4321,
  },
  build: {
    // 静态站点构建优化
    inlineStylesheets: "auto",
    assets: "_astro",
    // 启用并行构建以提升性能
    concurrency: Math.max(4, os.cpus().length - 1),
  },
  prefetch: {
    // 在开发环境禁用预取以加快构建
    prefetchAll: isProduction,
  },
  integrations: [
    react(),
    AutoImport({
      imports: [
        "@components/common/Button.astro",
        "@shortcodes/Accordion",
        "@shortcodes/Notice",
        "@shortcodes/Youtube",
        "@shortcodes/Tabs",
        "@shortcodes/Tab",
      ],
    }),
    mdx(),
  ],
  markdown: {
    processor: unified({
      smartypants: false, // 禁用自动引号转换，避免中文引号被转为 HTML 实体
      remarkPlugins: [
        remarkContentHeadings,
        remarkMermaid,
        remarkToc,
        [
          remarkCollapse,
          {
            test: "Table of contents",
          },
        ],
        remarkMath,
      ],
      rehypePlugins: [
        [rehypeKatex, {}],
        [
          rehypeExternalLinks,
          {
            target: "_blank",
            rel: ["noopener", "noreferrer"],
            test: (node) => {
              // 只对外部链接应用，内部链接不受影响
              const href = node.properties?.href;
              if (!href) return false;
              // 检查是否为外部链接
              return (
                href.startsWith("http://") ||
                href.startsWith("https://") ||
                href.startsWith("//")
              );
            },
          },
        ],
      ],
    }),
    shikiConfig: {
      themes: {
        // https://shiki.style/themes
        light: "github-light",
        dark: "github-dark-dimmed",
      },
    },
  },
  image: {
    // 配置图片处理
    remotePatterns: [
      {
        protocol: "https",
      },
    ],
    // 启用图片优化服务
    service: {
      entrypoint: "astro/assets/services/sharp",
    },
    // 图片优化配置
    domains: [],
    layout: "constrained",
  },
  vite: {
    // 开发与生产构建使用各自的依赖缓存，避免构建覆盖正在运行的开发模块。
    cacheDir: isProduction
      ? "node_modules/.vite-production"
      : "node_modules/.vite-development",
    plugins: [tailwindcss()],
  },
});
