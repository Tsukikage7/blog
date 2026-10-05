---
title: "分布式任务：用租约与 fencing 隔离过期写入"
description: "任务被接管后，旧执行者仍可能恢复并写入。分析租约的作用、存储端的写入检查，以及过期与接管的区别。"
created: 2023-06-13 09:14:52
updated: 2026-10-05
categories:
  - 分布式系统
tags:
  - Scala
  - Pekko
  - 租约
image: "/images/blog-covers/task-lease-fencing.svg"
---

一项任务原本由执行者 A 负责。A 暂停超过租约期限，协调者把任务交给 B；A 随后恢复，继续提交自己算出的旧结果。此时，协调者已经换了负责人，但写入目标是否知道这次接管？

心跳用于判断执行者是否可能失联，租约用于约定它持有任务的期限。两者都不能撤销 A 已拿到的连接、文件句柄或在途请求。要阻止接管后的旧写入，还需要写入目标检查一个递增的持有者编号，也就是 fencing token，并拒绝旧编号。

本文围绕任务接管解释这些机制，用 Pekko Typed 1.1.3 的单进程模型验证协议反例。模型没有实现真实的多机任务调度器，验证范围与生产系统所需条件会分别说明。

## 接管前，先让写入目标拒绝旧编号

协调者使用自己的单调时钟判断租约是否到期，不相信 Worker 自报时间。新持有者获取一个更大的 token；授予它之前，必须先在写入目标推进 fence。写入目标在同一个原子操作中检查 token 与写入数据。

若只在应用层先读取 fence 再写数据，两步之间可能发生接管，旧写入仍能穿过检查。目标端必须支持条件更新、事务或等价的原子检查机制。如果目标不支持这种能力，协调者的心跳协议不能凭空提供它。

```text
A 持有 token=1，暂停
协调者判断 A 租约到期
目标端 fence 推进到 2
B 收到 token=2
A 恢复并提交 token=1 → 目标拒绝
```

## 租约到期不等于旧写入立即失效

仅 TTL 到期、还没有新的持有者时，目标端的 fence 仍为 1。因此旧 token=1 的写入仍可能被接受。fencing 防止旧持有者覆盖已经接管的新持有者，不自动提供“墙钟到某一刻所有旧写入立刻失效”的保证。若业务需要绝对的租约有效期检查，写入目标还必须参与期限协议，并处理时钟与提交时刻的边界。

实验刻意检查这一反例，再接管到 token=2 后检查旧写入被拒绝，避免把两种保证混为一谈。

## 检查编号与写入必须是同一个原子操作

```scala
final class FencedSink {
  private var fence = 0L
  private var results = Map.empty[String, String]
  def advance(): Long = synchronized { fence += 1; fence }
  def write(token: Long, resultId: String, payload: String): Boolean = synchronized {
    if (token != fence) false
    else results.get(resultId) match {
      case Some(old) => old == payload
      case None => results += resultId -> payload; true
    }
  }
  def snapshot: Map[String, String] = synchronized { results }
}
```

这段 synchronized 只表达一个原子边界：比较 token、检查 resultId、写入结果必须一起发生。相同 resultId 和相同 payload 视为重放；相同 ID 却携带不同 payload 拒绝。幂等键应包含业务任务身份，不能直接用随机请求 ID 代替。

实验目标只有一个资源，因此 fence 是单值。多资源场景需要每个资源独立的代次与所有权，不能让另一个无关任务的接管使当前任务全部失效。token 要由可信协调机制分配，不接受 Worker 随意提供“更大的数字”。

## 编号持久化与申请重试属于真实协议的一部分

完整模型中的 Acquire 在有效租约内拒绝其他申请；Renew 必须同时匹配 owner incarnation 与 token，且租约仍有效。过期 Renew 无法复活租约。

Registry 重启实验保留同一个 FencedSink 对象，所以 token 继续递增，旧写入被拒绝。这个结果只验证“状态放在哪里”的差别，不证明进程重启后的持久性。真实服务必须持久化目标端 fence，或者在有一致性保证的协调存储里分配代次；Coordinator 自己的内存计数器重启归零是不安全的。

远程请求还要处理身份认证、授予回执丢失后的重试、协调者双主、重复提交和网络分区。本文的 Acquire 不实现网络级幂等重试；真实协议应记录申请 ID 与授予结果，避免回执丢失后重复分配。这里也没有把同步 sink 调用包装成真实远程存储客户端。

## 用可控时钟验证接管前后的写入行为

[LeaseFencingDemo.scala](/examples/content-completion/src/main/scala/LeaseFencingDemo.scala) 通过可控时钟验证：TTL 临界点续租被拒；仅过期而未接管时旧写入仍可达；接管后旧写入被拒；同一结果重放成功、冲突载荷失败；Registry 重启后目标端代次不重置。

源码使用 Java 17、Scala 2.13.16、Pekko Typed 1.1.3，运行方式见 [源码包](/examples/content-completion/content-examples.zip)。这些断言验证单进程模型中的接管和写入规则；分布式部署还需要持久存储、网络协议和故障测试。单个执行者内部的结果乱序问题，见 [异步任务的结果顺序与并发上限](/blog/async-task-ordering/)。
