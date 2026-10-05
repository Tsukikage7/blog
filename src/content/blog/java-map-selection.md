---
title: "Java Map 的并发边界：复合操作与请求合并"
description: "用确定性反例分析可变 key、丢失更新和慢加载，并实现可取消等待、失败可重试的 single-flight。"
created: 2023-08-03 09:00:53
updated: 2026-10-05
categories:
  - 并发编程
tags:
  - Java
image: "/images/blog-covers/java-map-selection.svg"
---

一个缓存写成 `if (!map.containsKey(k)) map.put(k, load())`，换成 ConcurrentHashMap 后仍可能重复加载。每个方法线程安全，只保护那个方法的操作；业务上的“检查再创建”需要另一个原子边界。

本文用 Java 17 分析三类独立问题：key 的身份是否稳定、更新是否包含多个操作、慢加载的生命周期是否可控。示例不是完整缓存库，关注可复现的并发语义。

## key 不稳定会让数据失去可达性

HashMap 的 key 如果在入表后改变了参与 equals/hashCode 的字段，后续查找会沿新 hash 寻找旧位置。示例把 id 从 1 改成 2，会出现 `size() == 1` 且 `get(key) == null` 的反例。

业务标识适合用不可变值，例如 `record TenantKey(String tenant, String user) {}`。这不能自动解决租户权限，只是让身份稳定。数组字段还需要注意引用相等与内容相等的区别；不可变 record 若持有可变对象，也不等于深度不可变。

## 单 key 原子性不扩展到多个操作

下面的两个线程各自先读到 0，再写入 1。用 CyclicBarrier 把读写之间的交错固定下来，就能稳定产生丢失更新，而无需反复运行碰运气。

```java
int old = counts.get("k");
read.await(5, TimeUnit.SECONDS);
counts.put("k", old + 1);
```

计数可用 `counts.merge("k", 1, Integer::sum)`；高竞争的统计计数可考虑 LongAdder，但它的汇总读取不是适合资金结算的原子快照。跨两个账户进行余额转移，不能靠分别执行两个 compute 获得事务原子性，应把不变量放进同一锁、同一状态对象或数据库事务。

ConcurrentHashMap 的遍历和 size 也不是整个 map 的一致快照。computeIfAbsent 的计算需保持短小，避免把慢远程调用放进原子映射过程；并发读取与更新的具体保证见 [Java 17 官方 API](https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/util/concurrent/ConcurrentHashMap.html)。

## 慢加载先选出执行者，再运行 I/O

目标是同一个 key 在加载期间共享一次结果。map 存储共享 Future，`putIfAbsent` 选出唯一执行者；加载放到专用 executor，失败和完成后移除条目。返回一个依赖 Future，避免某个调用者取消等待时把所有人的共享结果一起取消。

```java
static final class SingleFlight<K, V> {
        private final ConcurrentHashMap<K, CompletableFuture<V>> flights = new ConcurrentHashMap<>();
        private final Executor executor;
        SingleFlight(Executor executor) { this.executor = executor; }
        CompletableFuture<V> load(K key, Supplier<V> loader) {
            CompletableFuture<V> mine = new CompletableFuture<>();
            CompletableFuture<V> existing = flights.putIfAbsent(key, mine);
            if (existing != null) return existing.thenApply(value -> value);
            try {
                executor.execute(() -> {
                    try { mine.complete(loader.get()); }
                    catch (Throwable error) { mine.completeExceptionally(error); }
                    finally { flights.remove(key, mine); }
                });
            } catch (RuntimeException error) {
                flights.remove(key, mine);
                mine.completeExceptionally(error);
            }
            // 调用者取消这个依赖 Future 不会取消大家共享的 mine。
            return mine.thenApply(value -> value);
        }
    }
```

`remove(key, mine)` 很关键：清理只能移除自己创建的那一代加载，不能把未来可能出现的新加载删掉。executor 拒绝执行也是失败路径，否则 map 中会残留一个永远不完成的 Future。

这里合并正在进行的请求，成功后也移除，所以不是结果缓存。缓存需要容量、过期、负缓存、刷新和租户隔离等独立策略；把它们加入这个小模型会模糊它真正提供的保证。

## 超时和取消属于不同层次

调用者超时意味着不再等待，不必停止其他人共享的加载。共享加载本身需要独立的下游期限，避免永远悬挂。直接对共享 Future 调用 `orTimeout` 会改变其他等待者观察到的结果；需要对每个返回的依赖 Future 设置自己的等待期限。

Future 的取消也不等于底层 HTTP 已被取消。应由加载适配器定义可取消的 I/O 句柄，在没有等待者时是否中止由业务决定。示例保留加载直至完成，没有实现引用计数。

只按 key 合并不能限制不同 key 的数量。真实服务要给线程池与等待队列设置上限，并对高基数输入提供准入或拒绝策略。否则攻击者或异常流量可以把问题从“重复加载同一个 key”变成“无限加载不同 key”。

## 可执行的反例与边界测试

[源码包](/examples/content-completion/content-examples.zip) 中的 `MapConcurrencyDemo.java` 可直接运行：

```sh
java "src/main/java/MapConcurrencyDemo.java"
```

实验验证可变 key 查找失败、确定性丢失更新为 1、merge 的最终计数为 4000、两名等待者共享一次加载、其中一人取消不影响另一人、加载失败后可重试、executor 拒绝后不残留条目。请求合并部分使用受控任务队列推进，不依赖线程调度时机。这些结果验证协议，不是缓存吞吐或 JVM 性能基准。
