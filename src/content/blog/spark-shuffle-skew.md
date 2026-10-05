---
title: "Spark Shuffle：倾斜证据与二阶段聚合的正确性"
description: "用十万条可控数据观察热 key，证明拆分聚合保留 sum/count，并区分分区行数、Shuffle 字节与真实性能。"
created: 2023-07-03 13:35:57
updated: 2026-10-05
categories:
  - 数据工程
tags:
  - Spark
  - 性能诊断
image: "/images/blog-covers/spark-shuffle-skew.svg"
---

一个 Stage 只有少数 Task 很慢，增加 executor 后总耗时依旧没有改善。先要判断慢任务是在处理更多数据、遭遇 spill 与 GC，还是等待网络或远程存储。仅凭“一个 Task 慢”就加盐，可能增加一次 Shuffle 而没有触及瓶颈。

本文用 Spark 3.5.7 的 RDD 本地实验验证聚合重写的正确性，并展示原始记录按 key 分区时的倾斜。它不把本地模式的行数分布包装成集群性能基准。

## 从 Stage 证据定位问题

保留同一份输入、代码版本与资源配置，比较慢 Task 与中位数 Task 的 duration、Shuffle read bytes/records、spill bytes、GC time、fetch wait time、输入记录和失败重试。记录 key 频率、单行大小、空 key 比例与 join 两侧的基数。

| 证据                           | 需要验证的解释                | 优先措施                         |
| ------------------------------ | ----------------------------- | -------------------------------- |
| 一个分区记录与字节远高于中位数 | 热 key 或分区分布不均         | 分离热 key、检查聚合或 join 重写 |
| 同样记录数，但某分区字节大得多 | 大对象或异常宽行              | 裁剪字段、核对数据质量           |
| read 不大，GC/spill 很高       | 对象布局或聚合状态过大        | 减少状态、检查内存与序列化       |
| fetch wait 占比高              | 网络、远程 Shuffle 或失效重试 | 查网络与 executor 事件           |

增加分区数能分散不同 key，却不能把同一个 key 自动分到多个 reducer。另一方面，reduceByKey 有 map-side combine，小状态的 sum/count 可能在进入 Shuffle 前已经大幅缩小；热 key 的输入记录数不等于 reducer 实际接收的行数。[Spark RDD 官方指南](https://spark.apache.org/docs/3.5.7/rdd-programming-guide.html)

## 先证明聚合可以分解

令每组状态为 `(sum, count)`，合并运算是两个分量分别相加。第一阶段按 `(key, salt)` 聚合，第二阶段去掉 salt 再合并，就与直接按 key 求 sum/count 等价。在整数无溢出的前提下，这个合并具有结合性和交换性。

```text
原始记录 → (key, salt) → 各桶的 (sum, count)
                          → key → 合并 sum/count → sum / count
```

avg 不能简单平均各桶均值：一个桶 1 条记录、均值 10，另一个桶 9 条记录、均值 100，平均桶均值得 55，真实均值是 91。应携带 sum 与 count。count distinct 也不能直接累加各桶的不同值数量，因为同一值可能进入多个桶；需要全局去重或有明确定义的可合并近似状态。

浮点 sum 的合并顺序会影响低位结果。测试整数金额是为了严格比较；浮点业务需要定义容差、数值误差和异常值处理规则。顺序敏感的用户函数、取最后一条以及没有确定排序的 collect_list 都不能直接套用这个重写。

## 稳定拆分热 key，普通 key 保持原样

实验构造 100,000 条记录，其中 90,000 条属于 hot，剩余记录分布在 100 个普通 key。hot 使用稳定 event_id 对 8 取模，只有热 key 被拆分。真实数据应选择分布足够均匀的稳定字段或确定性哈希；若 event_id 与业务 key 高度相关，取模仍可能不均。

```python
salted = rows.map(lambda x: (
    (x[1], x[0] % salts if x[1] == "hot" else 0), (x[2], 1)
))
stage_one = salted.reduceByKey(combine, partitions)
final = stage_one.map(lambda x: (x[0][0], x[1])).reduceByKey(combine, partitions)
```

稳定 salt 让重跑更容易比较，随机 salt 则要求种子和再执行语义受到控制。桶数增大同时增加中间 key 数和第二阶段开销，应根据热 key 的工作量与聚合状态尺寸选择。

实验比较两份完整结果字典，所有 key 的 sum/count 必须相等。第一阶段聚合输出 108 行，来自 8 个 hot 桶和 100 个普通 key。更重要的是，它保留两个不同观测：原始记录强制 partitionBy 的行数分布，以及 reduceByKey 的最终业务结果。

## 实际运行结果与它不能说明的结论

[spark_skew_demo.py](/examples/content-completion/spark_skew_demo.py) 在固定输入、8 分区、local[2] 下得到：

| 观测                 | 最大分区行数 | 分区行数中位数 |
| -------------------- | ------------ | -------------- |
| 原始 key 对记录分区  | 91,400       | 1,350          |
| 加 salt 后对记录分区 | 12,950       | 12,550         |

hot 的 count 为 90,000，均值 47.9928；二阶段聚合与基线的所有整数 sum/count 一致。

这里统计的是原始记录重分区后的行数，未统计真实 reduceByKey 的 Shuffle 字节数，也没有记录可对比的生产耗时。不能用 `91400 / 12950` 宣称获得七倍加速。对已经能有效 map-side combine 的简单聚合，额外 Shuffle 完全可能更慢。

下载 [源码包](/examples/content-completion/content-examples.zip)，解压后执行：

```sh
docker run --rm --network none --hostname spark-local   --add-host spark-local:127.0.0.1 -e SPARK_LOCAL_IP=127.0.0.1   -v "$PWD:/examples:ro" apache/spark:3.5.7   /opt/spark/bin/spark-submit --master 'local[2]'   --conf spark.ui.enabled=false "/examples/spark_skew_demo.py"
```

## AQE 与手工加盐的适用边界

Spark SQL 的 AQE 使用运行时统计调整物理计划，包括分区合并、join 策略调整和部分倾斜 join 优化。它不把普通 RDD 的 reduceByKey 自动改写成本文的二阶段算法。SQL 场景应检查 action 执行后的最终计划，并核对倾斜判定阈值，不能只确认开关为 true。[Spark 3.5.7 AQE 文档](https://spark.apache.org/docs/3.5.7/sql-performance-tuning.html)

join 加盐与聚合加盐也不同：一侧记录拆桶后，另一侧对应热 key 的记录可能需要复制到各桶才能保持匹配，复制成本与重复输出必须单独验证。广播大表可能把倾斜问题变成每个 executor 的内存问题。

上线验证至少包括结果对账、实际 Shuffle bytes、任务耗时分布、spill/GC、失败重试与额外 Stage 成本。相同输入的重跑结果必须符合发布契约，见 [增量数仓与可重放发布](/blog/data-warehouse-layering/)。
