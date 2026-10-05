# 内容精简与工程化改写记录

整理日期：2026-10-05。当前公开技术内容为 **19 篇文章、4 篇技术笔记、1 个技术合集**，文学内容单独按作品组织。技术合集仅保留 epoll 8 篇；其他文章独立发布，按技术方向分类。

## 本轮删除

按用户要求彻底删除算法、面试题和 MySQL 正文，不转存草稿或原文副本：

- 正式文章 6 篇：majority-vote、sorting-algorithms、juc-interview-questions、mysql-index-guide、mysql-query-diagnosis、mysql-transactions。
- 技术笔记 5 篇：algorithm-basics、hadoop-interview-questions、nio-algorithm-interview-review、bytedance-data-dev-interview-review、centos-mysql-installation。
- 另删除重复的 Java IO、Scala 语法入门笔记 2 篇；深入内容由现有 Java/Scala 工程文章承接。
- 删除 algorithms、interviews、mysql 三个合集定义，以及 SortingDemo、JucDemo 两份示例。源码包重新生成，不包含这些旧例子。

三份原数据工程笔记提升为全新工程文章，旧笔记正文删除：数仓分层 → 增量发布；Spark RDD 执行 → Shuffle 倾斜与聚合正确性；集群脚本 → 有健康门槛的滚动操作。净变化为 22 → 19 篇文章、14 → 4 篇笔记、4 → 1 个合集。

历史 URL 直接跳转到有效目录或对应新正文，不保留重定向链。数据工程正式分类恢复生成；文章第三页已不存在，跳转回文章入口。个人介绍中的数据库技能不属于文章内容，本轮保留。

## 工程化改写

| 正文入口                                | 改写重点                                                                          | 可复现材料                             |
| --------------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------- |
| /blog/data-warehouse-layering/          | 实体版本、删除 tombstone、日期移动、幂等账本、原子发布、源位置与 watermark 的区别 | warehouse_replay.py                    |
| /blog/spark-shuffle-skew/               | 热 key 证据、sum/count 合并不变量、平均数反例、AQE 与 RDD 边界                    | spark_skew_demo.py                     |
| /blog/big-data-cluster-scripts/         | drain/ready/resume、既有故障预算、超时停止、重试与操作身份                        | rolling_gate.py                        |
| /blog/golang-concurrency-control/       | 固定 worker、有界队列、入口预算、取消与全部退出                                   | go/pool                                |
| /blog/golang-wire-dependency-injection/ | 资源所有权、构造失败、逆序清理、清理错误与幂等关闭；Wire 归档事实                 | go/lifecycle                           |
| /blog/java-map-selection/               | 可变 key、复合操作丢失更新、single-flight 与调用者取消                            | MapConcurrencyDemo.java                |
| /blog/async-task-ordering/              | 最新接纳请求优先、过时 Future、在途预算、失败保留视图                             | AsyncStateDemo.scala                   |
| /blog/task-lease-fencing/               | 租约到期反例、写入目标 fencing、结果幂等、重启状态归属                            | LeaseFencingDemo.scala                 |
| /blog/dubbo-go-triple-generic-call/     | Invocation 元数据、请求/响应封装、类型与版本契约、互操作测试矩阵                  | 已核对上游 PR；本轮未运行 SDK 双端服务 |

保留原创建日期，更新时间为真实整理日期。Go、Java、Scala 等标签用于检索，数据工程三篇不强行组成连续合集。

分类复核后移除「编程语言」，将其六篇文章分到并发编程（3 篇）、软件设计（1 篇）、分布式系统（2 篇）。其中两篇改为《异步任务：如何处理乱序结果与并发上限》和《分布式任务：用租约与 fencing 隔离过期写入》，从具体问题切入；Pekko 与 Scala 保留为实验实现技术，不再主导选题标题。新路径为 async-task-ordering 与 task-lease-fencing，原 Scala Actor / Spark 通信路径直接跳转到新正文，站内引用与技术封面同步更新。文章仍为 19 篇，示例实现未改变。

## 已执行的验证与限制

- Go 示例目标 go.mod 为 Go 1.24；本机 Go 1.27.0 执行 race 检查并重复 5 次，2 个包的 5 个测试通过。验证有界执行、首个错误取消并等待、预先取消、部分构造回滚、逆序幂等清理与错误身份。
- Java 17/Scala 2.13.16/Pekko 1.1.3 示例已编译并运行。Java 检查可变 key、确定性丢失更新、merge 4000 次、请求合并、等待者取消、失败重试与拒绝执行；Actor 检查乱序完成、容量与同步异常；fencing 检查仅 TTL 到期仍可写的反例，以及接管后的拒绝、重复/冲突和 Registry 重启。
- Python/SQLite 穷举 24 种事件顺序，检查删除与跨日修正、幂等重放、发布中故障回滚、版本冲突和过时消费位置。滚动模型只运行模拟适配器，验证超时停止下一节点、既有故障和批次预算；没有操作真实集群。
- Spark 3.5.7 local[2]：100000 条输入，90000 条 hot。原始 key 分区最大 91400 行；加盐分区最大 12950 行；第一阶段聚合 108 行；完整 sum/count 与基线相等。这是记录分布与结果正确性验证，不是实际 Shuffle 字节或生产加速倍数。
- 核对 Dubbo PR：#3154 于 2026-01-15 合入；#3077 关闭且未合入；samples#1016 于 2026-03-12 合入。互操作矩阵是后续接入要求，未冒充本轮实际验证。
- io_uring 保留上一轮 Linux/arm64 容器编译通过、初始化 EPERM 的事实，成功读取/EOF/短读未通过本轮运行验证。epoll 与开发工具其他文章没有因本轮改写被视为全量审校。

源码位于 public/examples/content-completion，依赖与博客应用分离；编译缓存位于临时目录，压缩包只含源码与说明。网站构建与 TypeScript 检查通过，合集规则 4 个测试通过；68 个正式 HTML 页面站内链接无断链，113 个历史跳转直接到有效目标，RSS 仅含 19 篇文章，搜索与站点地图无删除内容残留。浏览器核对了文章总数、数据工程目录与正文、仅剩 epoll 的合集页、正文跳转及新文章搜索结果。不提交 Git，不部署。
