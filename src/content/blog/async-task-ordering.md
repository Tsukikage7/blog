---
title: "异步任务：如何处理乱序结果与并发上限"
description: "以连续刷新同一份数据为例，处理旧结果覆盖新状态、请求堆积和失败回退；用 Pekko Typed 复现并验证。"
created: 2023-06-14 09:16:13
updated: 2026-10-05
categories:
  - 并发编程
tags:
  - Scala
  - Pekko
image: "/images/blog-covers/async-task-ordering.svg"
---

同一份数据被连续刷新两次：请求 A 先发出，请求 B 后发出，却是 B 先完成。如果 A 的旧结果随后也被写回，视图就会从新值退回旧值。解决这个问题需要明确哪个请求有权更新状态，同时限制那些还没完成的请求数量。

本文选择“最后接纳的刷新请求优先”：给请求编号，只应用最新请求的结果；过时请求仍计入并发上限；最新请求失败时保留最后一次成功值。这套规则适用于刷新视图，支付或审计这类必须逐笔处理的操作需要另一种规则。

示例使用 Java 17、Scala 2.13.16、Pekko Typed 1.1.3。Actor 逐条处理消息，但它发起的 Future 可以乱序完成；这里用这个模型验证异步任务的状态管理，不提供多节点一致性。

## 给请求编号，只应用最新结果

每个被接纳的 Refresh 获取递增请求编号，代码中称为 epoch。Completed 携带原编号。只有当前编号的成功结果可以覆盖状态；旧结果释放自己的并发名额，但不能写回视图。最新请求失败时保留最后一次成功值，旧请求成功也不能代替最新请求作决策。

| 事件         | 状态变化                    | 可观察结果              |
| ------------ | --------------------------- | ----------------------- |
| 接纳刷新     | epoch 加一，加入 pending    | 返回 Accepted(epoch)    |
| 在途已满     | 不调用 loader，不推进 epoch | 返回 Busy               |
| 当前代次成功 | 替换视图，释放名额          | Finished(applied=true)  |
| 旧代次完成   | 仅释放名额                  | Finished(applied=false) |
| 当前代次失败 | 保留最后成功值，释放名额    | Finished(failed=true)   |

Pekko 的 pipeToSelf 把 Future 结果转为 Actor 消息，状态修改仍发生在消息处理函数内。不要在 Future 的回调中直接修改 Actor 的可变状态。[Pekko 官方交互模式](https://pekko.apache.org/docs/pekko/1.0/typed/interaction-patterns.html)

## 过时请求也占用并发名额

```scala
object AsyncState {
  sealed trait Command
  final case class Refresh(id: String, replyTo: ActorRef[Event]) extends Command
  final case class Inspect(replyTo: ActorRef[Option[String]]) extends Command
  private final case class Completed(epoch: Long, result: Try[String], replyTo: ActorRef[Event]) extends Command
  sealed trait Event
  final case class Accepted(epoch: Long) extends Event
  case object Busy extends Event
  final case class Finished(epoch: Long, applied: Boolean, failed: Boolean) extends Event

  def apply(limit: Int, load: String => Future[String]): Behavior[Command] = {
    require(limit > 0)
    Behaviors.setup { context =>
      def loop(epoch: Long, value: Option[String], pending: Set[Long]): Behavior[Command] =
        Behaviors.receiveMessage {
          case Refresh(_, replyTo) if pending.size >= limit =>
            replyTo ! Busy
            Behaviors.same
          case Refresh(id, replyTo) =>
            val next = epoch + 1
            val future = Try(load(id)).fold(Future.failed, identity)
            context.pipeToSelf(future)(result => Completed(next, result, replyTo))
            replyTo ! Accepted(next)
            loop(next, value, pending + next)
          case Completed(done, result, replyTo) =>
            val applied = done == epoch && pending.contains(done) && result.isSuccess
            val nextValue = if (applied) result.toOption else value
            replyTo ! Finished(done, applied, result.isFailure)
            loop(epoch, nextValue, pending - done)
          case Inspect(replyTo) =>
            replyTo ! value
            Behaviors.same
        }
      loop(0L, None, Set.empty)
    }
  }
}
```

pending 包含已经过时但尚未完成的请求。只限制“当前请求数”会漏掉后台仍在运行的旧 Future；每次刷新替换 current，却不断发起新的 I/O，资源依旧无界。limit=2 时，第三次刷新立即得到 Busy，而不是先创建 Future 再排队。

loader 也可能在返回 Future 之前同步抛异常，示例把这一情况统一成失败 Future。若 loader 本身执行阻塞 I/O，它仍会阻塞 Actor，因此适配器必须快速返回，真正的阻塞工作使用独立 dispatcher 或 I/O 客户端。

## 验证乱序、容量限制与失败回退

[完整实验](/examples/content-completion/src/main/scala/AsyncStateDemo.scala) 提供三个 Promise，由测试主动决定完成顺序：接纳 A、接纳 B、拒绝 C；先完成 B 得到 new，再完成 A，视图仍是 new；重新接纳 C 后让它失败，视图保留 new。另测试 loader 的同步异常。

```text
Refresh A → Accepted(1)
Refresh B → Accepted(2)
Refresh C → Busy
Complete B → Finished(2, applied=true)
Complete A → Finished(1, applied=false)
Inspect → Some(new)
```

这个实验区分了“消息串行”和“业务时序正确”。测试等待明确的 Finished 回执，再读取视图，没有用 sleep 推测 Future 完成情况。依赖和编译命令在 [源码包 README](/examples/content-completion/README.md)。

## 超时、重启与逐笔处理需要另行设计

示例没有超时和 Future 取消。一个永远不完成的 loader 会永久占用名额。增加超时时，必须区分逻辑上放弃请求与底层 I/O 真正退出：不能在超时消息到达时立即释放真实资源预算，而让未中止的请求继续累积。

epoch 在 Actor 重启后会重置，状态和 pending 也会丢失。跨重启请求需要 incarnation ID，必须恢复的业务状态则应持久化；不能把这份内存状态机称为持久任务管理。

最新请求优先只是一个选择。支付、审计或消息投递通常不能忽略旧结果，需要按业务 ID 保留每个操作的终态，并独立处理重复投递。写入共享外部资源还需要目标端拒绝旧代次，见 [租约与 fencing](/blog/task-lease-fencing/)。
