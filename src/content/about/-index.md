---
title: 关于我
description: Go 后端研发工程师 | 云产品与网络研发 | Apache dubbo-go 生态贡献者
image: "@assets/avatar.webp"
imageAlt: 韩信的头像
draft: false

info:
  name: 韩信
  title: Go 后端研发工程师
  location: 上海
  summary: 以 Go 为主要开发语言，专注云产品、网关与事件驱动系统。从业务拆分、接口设计到上线排障，关注清晰的服务边界和可靠的工程实现。

skillCategories:
  - name: Go 与服务架构
    icon: wrench
    skills:
      - Go / Hertz / Kitex
      - gRPC / Protobuf / gRPC-Gateway
      - DDD / CQRS / 契约优先
      - Consul / Wire / Fx

  - name: 数据存储与访问
    icon: database
    skills:
      - MySQL / PostgreSQL
      - Redis / ClickHouse / S3
      - GORM / pgx

  - name: 消息链路与可靠性
    icon: bolt
    skills:
      - Kafka / NATS / JetStream
      - 幂等 / 失败补偿 / 到期处理
      - Outbox / Inbox / 异步事件

  - name: 网关与网络研发
    icon: network
    skills:
      - Nginx / OpenResty / LuaJIT
      - APISIX / L7 路由 / 动态 upstream
      - WRR / 一致性哈希 / 健康检查
      - TCP / UDP / HTTP / WebSocket

  - name: 可观测性与工程平台
    icon: chart
    skills:
      - OpenTelemetry / Prometheus
      - Grafana / Loki / Tempo
      - Docker Compose / OpenAPI
      - OIDC / Cerbos / PostgreSQL RLS

  - name: Agent 与开源研发
    icon: code
    skills:
      - Eino / ReAct Agent / Tool Calling
      - OpenAI
      - Dubbo / Triple / 泛化调用
      - gRPC Server Reflection / Benchmark

education:
  - degree: 计算机科学与技术 · 本科
    school: 南京信息工程大学
    badge: 双一流
    logo: /images/about/nuist.png
    location: 南京

experience:
  - title: 后台开发工程师 · 网络研发
    company: 优刻得科技股份有限公司
    logo: /images/about/ucloud.png
    period: 2024 - 至今
    location: 上海
    description: 负责 VoyraCloud 的后端架构与核心业务落地，同时参与应用型负载均衡 ALB、全球动态加速 PathX 的后端研发。
    highlights:
      - VoyraCloud：从 0 到 1 独立搭建后端，按 DDD/CQRS 组织 8 个核心服务，落地 7 类订单与卡支付、余额支付、自动续费 3 条支付路径。
      - 资源交付：对接 UCloud 实例生命周期、套餐变更和到期处理，通过 Kafka 异步事件、幂等与失败补偿串联支付和资源履约。
      - ALB：实现 Host、Path、Header、Query 路由条件与后端池管理，支持动态 upstream、权重调度、健康检查和实例变更实时生效。
      - PathX：参与多协议接入、加速线路与多地域路由研发，覆盖节点就近接入、跨地域回源及配置下发。
      - 工程实践：建设指标、日志和链路追踪体系，参与高并发链路调优，并基于 Eino 实践 AI 客服与 ReAct Agent。

openSource:
  - name: Apache Dubbo 生态
    logo: /images/about/dubbo.png
    role: Contributor
    period: 2025.12 - 至今
    url: https://github.com/apache/dubbo-go
    description: 持续参与 dubbo-go、Pixiu 网关及示例仓库，贡献协议能力、代理性能优化、可观测性与回归测试。
    contributions:
      - 通过连接复用与描述符缓存优化 gRPC、Triple 和 Dubbo 代理链路，相关 PR 已合入。
      - 完善可观测性端到端示例，修复集成测试竞态；继续推进跨信号字段与动态日志级别的回归工作。
      - 为 Triple 补充泛化调用，为 Pixiu 增加 gRPC Server Reflection，并完善示例与文档。
    links:
      - label: Pixiu 代理性能优化 · PR 1017
        url: https://github.com/apache/dubbo-go-pixiu/pull/1017
        status: 已合入
      - label: 可观测性端到端示例 · PR 1128
        url: https://github.com/apache/dubbo-go-samples/pull/1128
        status: 已合入
      - label: 集成测试竞态修复 · PR 1130
        url: https://github.com/apache/dubbo-go-samples/pull/1130
        status: 已合入
      - label: Triple 泛化调用 · PR 3154
        url: https://github.com/apache/dubbo-go/pull/3154
        status: 已合入

  - name: Apache Dubbo Admin
    logo: /images/about/dubbo.png
    role: Contributor
    period: 2026.08 - 至今
    url: https://github.com/apache/dubbo-admin
    description: 修复服务调试中的大整数精度问题，避免雪花 ID 被 JavaScript 数值解析舍入；补充安全与非安全整数的回归测试。
    links:
      - label: 服务调试大整数精度修复 · PR 1527
        url: https://github.com/apache/dubbo-admin/pull/1527
        status: 评审中

  - name: OceanBase PowerContext
    logo: /images/about/powercontext.svg
    role: RFC 与社区提案
    period: 2026.09 - 至今
    url: https://github.com/oceanbase/powercontext
    description: 提出可解释的 PreparedContext Receipt 设计，说明上下文选择来源、遗漏原因与隐私边界；另提交 Helm Chart 与 Kubernetes 部署指南的需求提案。
    links:
      - label: PreparedContext Receipt RFC · PR 1435
        url: https://github.com/oceanbase/powercontext/pull/1435
        status: 评审中
      - label: Helm 与 Kubernetes 部署提案 · Issue 1609
        url: https://github.com/oceanbase/powercontext/issues/1609
        status: 讨论中

social:
  github: https://github.com/Tsukikage7
  email: chongyanx@163.com
---

## 我关注的工程问题

我习惯从业务流程出发拆分领域和服务，明确接口、状态变化和数据归属，再把它们落实到代码中。

交易与资源交付让我持续关注异步链路中的幂等、重试和失败补偿；网关与网络研发让我更重视路由、连接和调度的性能表现。对于已经上线的系统，我希望能够通过日志、指标和追踪解释问题，而不只停留在“服务正在运行”。

开源贡献也是我验证想法的一种方式：从具体问题出发，阅读实现、补充测试和示例，再通过讨论与审查完善改动。

## 关于这个站点

这里记录我的技术实践、源码阅读和问题复盘，主要围绕 [Go](https://go.dev/)、分布式系统、网络与开源研发展开。我希望留下的不只是结论，还有问题出现的背景、判断依据和解决过程。

站点以静态页面和 CDN 分发内容，采用灰绿色调与书刊式排版。构建工具与样式方案：
