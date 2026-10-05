---
title: "Go 并发控制：准入、背压与取消的资源边界"
description: "从无界等待的反例出发，构建有界 worker pool，验证并发上限、失败取消和退出回收。"
created: 2024-11-13 08:09:01
updated: 2026-10-05
categories:
  - 并发编程
tags:
  - Go
image: "/images/blog-covers/golang-concurrency-control.svg"
---

并发控制要回答的第一个问题是：压力超过处理能力时，工作停在哪里？如果每个请求先创建 goroutine，再在 goroutine 内等待信号量，那么执行中的调用有上限，等待中的 goroutine、捕获的请求对象和超时计时器仍可能持续增长。

这篇用 Go 1.24 的独立实验讨论三条边界：接纳多少任务、同时执行多少任务、失败后怎样结束整个批次。它适用于有限批次的独立任务，不提供通用任务调度器。

## 先计算预算，再选择同步工具

假设外部服务每次调用平均占用 80 ms，允许同时占用 20 个连接。在完全稳定且没有其他瓶颈的理想条件下，吞吐上限约为 `20 / 0.08 = 250 次/秒`。这是容量估计，真实延迟分布、重试和连接复用都可能降低吞吐；不能把它当压测结果。

如果入口达到 400 次/秒，增加等待队列只会延后失败。需要明确在入口阻塞、拒绝、降级还是写入持久队列。并发限制控制同时占用的资源，速率限制控制单位时间的请求量，两者不能互相替代。

| 边界   | 本文模型               | 服务中的对应措施           |
| ------ | ---------------------- | -------------------------- |
| 执行数 | 固定 W 个 worker       | 与连接池、下游配额共同预算 |
| 等待数 | 容量 Q 的 jobs channel | 排队期限与拒绝策略         |
| 提交者 | 当前调用者同步提交     | 入口也必须有并发上限       |
| 取消   | context 传给每个任务   | I/O 必须使用能取消的 API   |

W=4、Q=8 时，池中待执行与执行中的任务最多 12 个，worker 数恒定为 4。调用方已经持有的整个输入 slice 不在这个上限里。若有一万个 HTTP handler 同时阻塞提交，仍有一万个等待者；这个池不会替入口解决资源准入。

## 一个批次只创建固定数量的 goroutine

任务从调用者直接进入有界队列。第一次任务错误取消兄弟任务，随后关闭队列并等待全部 worker 退出。关闭权属于唯一的提交者，worker 不关闭 channel。

```go
package pool

import (
	"context"
	"errors"
	"sync"
)

// Run 的队列与执行者有界；fn 必须响应 ctx，否则取消后仍会等待它退出。
func Run[T any](parent context.Context, workers, capacity int, items []T, fn func(context.Context, T) error) error {
	if workers < 1 || capacity < 0 || fn == nil {
		return errors.New("invalid pool configuration")
	}
	ctx, cancel := context.WithCancelCause(parent)
	defer cancel(nil)
	jobs := make(chan T, capacity)
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for item := range jobs {
				if ctx.Err() != nil {
					return
				}
				if err := fn(ctx, item); err != nil {
					cancel(err)
					return
				}
			}
		}()
	}
submit:
	for _, item := range items {
		select {
		case <-ctx.Done():
			break submit
		case jobs <- item:
		}
	}
	close(jobs)
	wg.Wait()
	return context.Cause(ctx)
}
```

`context.WithCancelCause` 保存第一个取消原因。失败后的其他 worker 可能返回同一个取消原因，不能把它们当成多个独立下游故障。本实现采取“遇到首个失败终止批次”，不适合需要收集全部任务结果的场景。后者应定义带任务 ID 的结果协议，明确部分成功的重试策略。

取消与提交同时就绪时，select 可能仍将一个任务放进队列；worker 在执行前再检查取消状态。即使这次检查通过，取消也可能紧接着发生，因此 fn 仍要在 I/O 和循环内部响应 ctx。检查一次 `ctx.Err()` 不能保证取消后的世界完全静止。

## 取消意味着协作退出，不能强杀 goroutine

如果 fn 阻塞在不支持 context 的系统调用，Run 会继续等待。提前返回、留下后台 worker，会让调用者误以为资源已经回收。为外部 HTTP、RPC、数据库请求设置期限，并把 context 传到底；CPU 密集循环则在可接受的粒度检查取消。

超时预算还应覆盖排队。任务的业务期限从接收请求开始计算，不能等 worker 拿到任务后重新获得完整超时。超过期限的排队任务需要在调用下游前丢弃。并发令牌也不应跨越与下游无关的用户等待或无限重试。

## 用失败实验验证边界

[完整源码与测试](/examples/content-completion/content-examples.zip) 中包含 `go/pool`，下载解压后运行：

```sh
cd "go"
go test -race -count=5 ./...
```

测试处理 10,000 个任务，记录执行区间的最大活动数，检查它不超过 4；另一个实验让首个任务失败、其他任务等待取消，确认 Run 返回时这些执行者已退出。还有预先取消的 context 与非法配置测试。测试使用同步信号与原子计数，不通过“睡一秒应该结束了”判断正确性。

这些检查证明实现的资源上限与退出语义，不证明某个 worker 数具有最佳性能。部署前应观察排队时间分位数、执行时间、拒绝数、活动 worker 数、下游连接占用和重试次数。队列长期满时，优先定位资源预算与瓶颈，而不是继续扩大 Q。

对于生命周期较长的常驻服务，worker pool 还需要明确接收关闭、在途任务排空和进程退出的顺序；这与资源装配有关，见 [Go 依赖装配与资源生命周期](/blog/golang-wire-dependency-injection/)。
