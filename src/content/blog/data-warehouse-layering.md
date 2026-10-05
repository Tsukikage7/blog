---
title: "增量数仓：事件版本、迟到数据与可重放发布"
description: "从订单更新、跨日修正与删除出发，设计版本投影、幂等账本和原子发布，用故障注入验证可重放性。"
created: 2023-07-25 14:37:26
updated: 2026-10-05
categories:
  - 数据工程
tags:
  - 数据一致性
  - 增量处理
image: "/images/blog-covers/data-warehouse-layering.svg"
---

给数据仓库命名 ODS、DWD、DWS、ADS，并不能回答：同一订单重复到达怎么办？昨日订单今天被修正到另一个业务日期，旧分区怎样撤回？作业在写完汇总、还没记录消费位置时崩溃，会不会重复计费？

本文从一个具体契约开始：输入是订单的完整状态事件，输出是按业务日期汇总的当前有效订单金额与数量。Python 3.12 与 SQLite 仅用于把一致性协议缩小成可运行实验，不承担 CDC 连接器、分布式湖仓或生产性能验证。

## 先确定事实粒度与版本权威

输入事件包含 `order_id、version、day、cents、deleted`。一条事件表示一个订单在某个源端版本下的完整状态，金额用整数分表示。version 由单一权威源为每个订单单调分配，不能使用消费者到达时间或墙钟时间代替。

| 输入                          | 正确处理               | 常见错误                 |
| ----------------------------- | ---------------------- | ------------------------ |
| A/v1，10 月 1 日，100 分      | 记录订单与版本         | 直接向汇总加 100         |
| A/v2，改到 10 月 2 日，150 分 | 旧分区撤回、新分区加入 | 只更新新分区             |
| A/v1 再次到达                 | 幂等重放或旧版本忽略   | 把旧金额重新累加         |
| B/v2 删除，随后到达 B/v1      | 保留删除版本，拒绝复活 | 物理删掉状态后接受旧消息 |
| A/v2 出现不同载荷             | 报冲突，阻止发布       | 按最后到达的数据覆盖     |

订单的当前状态与消费位置是两种不同事实。前者用每实体版本比较；后者记录输入流已处理到哪里。多分区来源需要位置向量或可证明完整的批次边界，不能简单取所有分区 offset 的最大值。

这里的版本投影要求事件是完整状态。若输入只有“金额增加 50”这样的增量，丢弃低版本事件可能丢失必要变化；需要按序执行、缺口检测与补齐，而不能直接套用最后版本获胜。

## 发布需要一个同时可见的边界

实验把事件账本、当前订单投影、日期汇总和 checkpoint 放在一个事务内。ledger 用 `(order_id, version)` 去重，同时检查同版本载荷冲突；current 只接受更高版本，并保留 tombstone；summary 在当前状态上重算；最后更新输入位置。

```text
校验批次起点 = 已提交 checkpoint
  → 记录幂等账本
  → 更新当前订单状态（保留删除版本）
  → 生成对应汇总
  → 更新 checkpoint
  → 一次提交，使这些结果共同可见
```

下列函数是完整实验中的发布主体：

```python
def publish(db, events, start, end, fail=False):
    """start/end 是单一输入流的批次位置；version 是每个订单的源端版本。"""
    with db:
        actual = db.execute("SELECT offset FROM checkpoint WHERE id=1").fetchone()[0]
        if actual != start or end < start:
            raise ValueError("checkpoint conflict")
        for event in events:
            if event.version < 1 or (not event.deleted and
                                     (event.day is None or event.cents is None or event.cents < 0)):
                raise ValueError("invalid event")
            payload = json.dumps(asdict(event), sort_keys=True)
            old = db.execute("SELECT payload FROM ledger WHERE order_id=? AND version=?",
                             (event.order_id, event.version)).fetchone()
            if old and old[0] != payload:
                raise ValueError("same version has conflicting payloads")
            db.execute("INSERT OR IGNORE INTO ledger VALUES(?,?,?)",
                       (event.order_id, event.version, payload))
            db.execute("""INSERT INTO current VALUES(?,?,?,?,?)
              ON CONFLICT(order_id) DO UPDATE SET version=excluded.version,
              day=excluded.day, cents=excluded.cents, deleted=excluded.deleted
              WHERE excluded.version > current.version""",
                       (event.order_id, event.version, event.day, event.cents, event.deleted))
        # 小规模模型全量重算；生产增量发布必须同时修改旧分区与新分区。
        db.execute("DELETE FROM summary")
        db.execute("""INSERT INTO summary SELECT day, SUM(cents), COUNT(*)
                      FROM current WHERE deleted=0 GROUP BY day""")
        if fail:
            raise RuntimeError("fault between projection and checkpoint")
        db.execute("UPDATE checkpoint SET offset=? WHERE id=1", (end,))
```

全量重算汇总适合小模型，代价随订单数增长。生产增量实现需要获取被更新订单的 before/after：从旧日期减去旧金额与数量，向新日期加入新金额与数量；删除只撤回旧状态。两边分区必须属于同一次发布，不能出现“昨日已减、今日还没加”的中间视图。

同一事务中的 ledger 不能无限增长，tombstone 也不能随意清除。保留期必须覆盖允许重放的输入范围；删除版本清除后，旧事件可能让订单复活。压缩前要证明输入的低版本事件不再可达，或用另一个持久版本上界继续拒绝它们。

## 分布式存储怎样保留这个契约

当数据文件与消费位置不在同一事务域，可以先写入一个不可变的新 snapshot：包含受影响分区的数据、schema version、输入位置向量和校验摘要；检查完成后，比较预期父版本并原子更新发布指针。读者只通过已发布指针读取，未发布文件由回收过程清理。

如果数据发布后、消息确认前崩溃，重试会再次读取这批输入。幂等投影和批次身份让它识别已发布结果。若源数据先确认、目标后发布，则崩溃可能永久丢失输入；这个顺序不能通过“最终会重试”弥补。

这是一种设计契约，不代表任意对象存储天然支持事务。要核对表格式或元数据服务提供的原子提交与并发冲突检测能力，禁止把目录里逐个覆盖文件视为完整发布。

## Watermark 不能代替消费位置

event time 表示业务事件发生时间，processing time 表示处理时刻，watermark 表示系统对事件时间进度的判断。迟到事件是否进入已关闭窗口，还需要明确保留期与修正策略。watermark 不是“所有来源已消费并持久化到某个 offset”的提交证明。[Flink 官方时间语义](https://nightlies.apache.org/flink/flink-docs-stable/docs/concepts/time/)

本模型不使用 watermark：它维护订单当前状态，允许更高版本修正过去的业务日期。若业务要求日结不可修改，就应输出独立的调整记录并定义结算版本；不能在下游账单已发出后悄悄改写历史结果。

全量快照接入 CDC 时，还要有源端一致性切点：快照包含到哪里、增量从哪里继续、二者重叠怎样去重。单纯“先扫全表，再从现在开始消费”可能漏掉扫描过程中的更新。源端切点、事件版本、schema 变更策略都属于接入契约。

## 让重放与故障成为测试输入

[warehouse_replay.py](/examples/content-completion/warehouse_replay.py) 穷举四条事件的 24 种排列。每种顺序都必须得到相同结果：仅 A/v2 有效，10 月 2 日 150 分、1 单；B 已删除且不会被 B/v1 复活。再次重放相同事件，金额、数量和账本条数保持不变。

```sh
python3 "warehouse_replay.py"
```

另在汇总更新与 checkpoint 更新之间抛出异常，检查账本、汇总、位置全部回滚；重试后恢复正确状态。同版本不同载荷阻止发布，过时批次起点也被拒绝。通过的是 SQLite 单连接的原子性与投影协议，不是分布式端到端 exactly-once 认证。

上线后应持续比较发布版本、输入位置、分区金额与数量、重复事件数、版本冲突数、删除数和最老未处理事件年龄。迟到修正必须能定位到输入事件与发布批次，才能解释报表为何发生变化。性能层面的分区倾斜，另见 [Spark Shuffle 聚合重写](/blog/spark-shuffle-skew/)。
