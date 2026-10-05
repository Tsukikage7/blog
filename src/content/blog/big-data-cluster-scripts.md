---
title: "集群运维的失败边界：批次预算、健康门槛与停止条件"
description: "把批量 SSH 片段改为显式操作协议，用模拟适配器验证既有故障、超时与后续节点停止。"
created: 2023-07-30 07:16:45
updated: 2026-10-05
categories:
  - 数据工程
tags:
  - 运维自动化
  - 故障恢复
image: "/images/blog-covers/big-data-cluster-scripts.svg"
---

批量执行 `ssh host "$*"` 只能回答命令有没有结束，不能回答节点是否已经恢复服务，也不能保证失败以后停止操作其他节点。集群操作需要显式控制“当前允许损失多少服务能力”和“什么证据才能进入下一批”。

本文把大数据集群启停脚本重写为一个最小滚动操作模型。Python 示例只使用模拟适配器，不连接真实集群、不执行远程重启。它讨论操作协议，部署到 HDFS、YARN、Spark 或其他系统时必须使用各自的 drain 与 membership 机制。

## 先定义操作成功，再编排命令

一次节点操作包含 `drain → restart → wait_ready → resume`，每一步有期限和结构化结果。drain 要确认新任务不再进入、已有任务达到可接受的排空状态；restart 成功不代表业务恢复；wait_ready 必须检查服务与集群成员状态。

| 健康证据        | 可以证明         | 不能据此证明                 |
| --------------- | ---------------- | ---------------------------- |
| 进程存在        | 进程仍活着       | 端口可用、业务正确           |
| 服务探针通过    | 某条请求路径工作 | 节点已加入成员或完成副本恢复 |
| membership 正确 | 集群接受该节点   | 历史数据一致、用户路径通过   |
| 业务校验通过    | 指定业务结果成立 | 所有负载与故障场景都正常     |

有状态系统还要检查副本与 quorum。`max_unavailable=1` 只是一条节点级预算，不能替代副本拓扑：两个节点可能承载同一个分片的关键副本。生产编排器应在选择下一批之前校验故障域与分片约束。

## 既有故障也消耗预算

计划每批操作 1 个节点，并不意味着总不可用数最多 1。如果集群已经坏了一个节点，再重启健康节点会产生两个不可用节点。本模型每批开始前检查整个集群，拒绝 `既有不健康数 + 本批节点数 > max_unavailable` 的操作。

```python
def roll(hosts, adapter, emit, batch_size=1, max_unavailable=1):
    if not hosts or len(set(hosts)) != len(hosts):
        raise ValueError("host list must be non-empty and unique")
    if not 1 <= batch_size <= max_unavailable:
        raise ValueError("batch exceeds availability budget")
    operation = str(uuid4())
    for offset in range(0, len(hosts), batch_size):
        batch = hosts[offset:offset + batch_size]
        # 批次开始前检查整个集群，既有故障也消耗不可用预算。
        unhealthy = sum(not adapter.health(host).ready for host in hosts)
        if unhealthy + len(batch) > max_unavailable:
            emit(operation, "blocked", batch)
            return False
        for host in batch:
            for step in ("drain", "restart", "wait_ready", "resume"):
                try:
                    ok = adapter.step(host, step, operation, timeout_seconds=30)
                except (TimeoutError, OSError):
                    ok = False
                emit(operation, step + (":ok" if ok else ":failed"), host)
                if not ok:
                    return False
            if not adapter.health(host).ready:
                emit(operation, "postcheck:failed", host)
                return False
    return True
```

协议在第一个失败点停止，保留日志与当前节点现场，不自动 resume 或继续下一台。操作 ID 贯穿每个阶段，便于把超时、节点状态和后续人工恢复关联起来。自动回滚也要有明确的安全前提，不能在状态未知时继续执行相反命令。

这里的 adapter.step 是受信任的接口约定，必须真正实现 deadline 与退出码校验。模型传入 timeout_seconds 不会神奇地打断一个不响应期限的适配器；真实实现要给 subprocess/SSH 调用设置超时，处理进程组、截断输出并读取结果。

## 重试不能把未知当失败

SSH 连接断开时，远端 restart 可能已经成功。因此“超时就再执行一遍”不一定安全。恢复前先回读节点状态，按 operation ID 查询已完成步骤，再决定继续、重试或人工介入。幂等操作需要目标端可识别的操作身份；单纯重复发送相同字符串不等于幂等。

生产执行器应只支持明确的操作枚举和已验证的 inventory，不把任意用户输入拼成远程 shell。dry-run 需要输出目标节点、批次、健康门槛和预期动作，不能只打印一个未校验的命令字符串。密钥、密码和完整敏感环境变量不写入操作日志。

## 分清重启服务与重新引导集群

节点重启、配置发布、扩容和全新 bootstrap 有不同前置条件。不能让“start-all”隐式格式化元数据或创建集群身份，也不能把端口监听当成 NameNode 安全模式结束、DataNode 副本恢复或 Spark Worker 资源可调度的证明。具体探针需从目标服务当前配置与版本得出。

这一模型没有操作锁或持久 journal，两个并行操作可能共同突破预算。生产扩展首先应增加集群级操作准入、持久阶段记录及恢复协议，再考虑更大并发。仅把 for 循环换成线程池会把问题变得更难定位。

## 可运行的失败注入

[rolling_gate.py](/examples/content-completion/rolling_gate.py) 验证四条路径：全部成功时节点按顺序完成四个阶段；第二台 wait_ready 超时后第三台从未被操作，第二台不会 resume；集群已存在成员异常时阻止第一批；批次超过预算时拒绝执行。

```sh
python3 "rolling_gate.py"
```

这些检查只证明编排顺序与停止条件。没有真实节点、网络隔离、quorum 或副本故障测试，不能报告生产滚动升级已经安全。工作负载本身的版本隔离需要目标端约束，可结合 [任务租约与过期写入隔离](/blog/task-lease-fencing/) 理解“停止调度”与“停止旧写入”的差别。
