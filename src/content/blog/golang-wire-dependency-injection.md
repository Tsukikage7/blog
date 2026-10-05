---
title: "Go 依赖装配：构造失败、资源所有权与逆序回收"
description: "把依赖注入放回资源生命周期，验证部分构造失败的回滚、清理错误与幂等关闭，并校正 Wire 的维护状态。"
created: 2024-08-06 05:56:21
updated: 2026-10-05
categories:
  - 软件设计
tags:
  - Go
  - 依赖注入
image: "/images/blog-covers/golang-wire-dependency-injection.svg"
---

依赖注入容易写成“构造函数怎样连起来”，实际最危险的路径却是：数据库连接已打开，缓存初始化失败，进程启动中断，先前创建的资源由谁关闭？还有一条正常路径：服务停止接受请求以后，后台任务与连接池以什么顺序结束？

本文保留原 Wire 文章的地址，把重点放在可检查的装配入口。Wire 官方仓库于 2025-08-25 归档，并明确标注停止维护。已有项目可以保留固定版本及生成代码；新项目选择工具时需要考虑这个事实。[Wire 官方仓库](https://github.com/google/wire)

## 依赖图同时决定退出顺序

一个示例应用持有 Store 和 Cache，服务使用两者。创建顺序是 Store → Cache → Service；退出时先停止接收请求、等待服务内部任务结束，再关闭 Cache → Store。清理顺序必须与依赖关系相容，仅凭函数名排序没有意义。

构造函数的约定应写清楚：成功返回意味着所有权交给装配入口；失败返回时，构造函数必须关闭自己内部已经创建但未返回的资源。本文 `open` 的失败结果不携带待清理资源。否则装配入口无法知道构造函数内部完成到了哪一步。

| 情况             | 所有权与处理                           |
| ---------------- | -------------------------------------- |
| Store 构造失败   | open 自己清理部分构造，不返回 App      |
| Cache 构造失败   | 装配入口关闭已成功构造的 Store         |
| Service 校验失败 | 依次关闭 Cache、Store，保留校验错误    |
| App 正常退出     | 调用同一个 cleanup，重复调用不重复关闭 |

## 最小装配入口

Go 1.24 示例用 `io.Closer` 表达资源的最小清理能力。真实业务接口应只暴露业务操作，不为了方便把整个连接池接口传遍应用。

```go
package lifecycle

import (
	"errors"
	"fmt"
	"io"
	"sync"
)

type App struct {
	Store io.Closer
	Cache io.Closer
}

// Build 是依赖图的装配入口，open 返回成功资源的所有权。
func Build(open func(string) (io.Closer, error), validate func(*App) error) (*App, func() error, error) {
	var resources []io.Closer
	var closeErr error
	var once sync.Once
	cleanup := func() error {
		once.Do(func() {
			for i := len(resources) - 1; i >= 0; i-- {
				closeErr = errors.Join(closeErr, resources[i].Close())
			}
		})
		return closeErr
	}
	store, err := open("store")
	if err != nil {
		return nil, nil, fmt.Errorf("open store: %w", err)
	}
	resources = append(resources, store)
	cache, err := open("cache")
	if err != nil {
		return nil, nil, errors.Join(fmt.Errorf("open cache: %w", err), cleanup())
	}
	resources = append(resources, cache)
	app := &App{Store: store, Cache: cache}
	if err := validate(app); err != nil {
		return nil, nil, errors.Join(fmt.Errorf("validate service: %w", err), cleanup())
	}
	return app, cleanup, nil
}
```

`errors.Join` 让启动失败与回收失败都能被 `errors.Is` 检查。只记录关闭日志再返回启动错误会丢失清理问题；用清理错误覆盖启动错误又会掩盖根因。错误要带资源名及阶段，日志不应把连接凭据写进去。

`sync.Once` 只保证清理函数执行一次，不保证清理本身一定成功。这里的 Close 是终止性操作，不在第二次调用时自动重试。若某个外部资源支持可恢复的释放，需要单独设计重试状态，不能借用这个幂等封装宣称释放成功。

## Wire 生成调用顺序，应用定义生命周期

Wire 的 provider 可以返回清理函数和错误，生成的 injector 会编排相应清理调用；接口绑定和 provider set 仍然只是类型装配。它不能替业务决定“是否先等待请求排空”，也不会赋予数据库迁移幂等性。[Wire provider 指南](https://github.com/google/wire/blob/main/docs/guide.md)

已有 Wire 项目应核对生成的代码：失败分支是否执行已创建资源的 cleanup，成功返回的 cleanup 是否在程序入口被调用，生成文件是否与 provider 同步。provider 内禁止隐式启动不受管理的 goroutine，否则构造函数一旦返回，后台生命周期就脱离了依赖图。

同样不要在每次连接池初始化时自动执行破坏性 schema 迁移。迁移、配置校验和服务装配具有不同的失败与重试语义，应保持显式的操作边界。小型依赖图直接写装配代码往往已经足够，不需要把运行时反射容器引入每次请求。

## 从“能启动”验证到“能安全失败”

[源码包](/examples/content-completion/content-examples.zip) 中的 `go/lifecycle` 使用虚拟资源运行三条路径：第二个资源失败时只关闭第一个；服务校验失败时逆序关闭全部资源并保留两种错误；成功后调用两次 cleanup，只关闭一遍。执行：

```sh
cd "go"
go test -race -count=5 ./...
```

虚拟资源实验验证所有权协议和错误传播，未连接真实数据库或缓存。实际服务还需要在进程入口验证退出顺序：先关闭入口，限定排空时间，取消剩余任务，等待其退出，然后清理底层资源。若排空超时，报告仍未完成的操作；不能把 `defer cleanup()` 当成完整的优雅退出方案。
