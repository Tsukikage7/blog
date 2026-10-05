---
title: "[epoll] EP4 多进程/多线程的 epoll 使用"
image: "https://assets.tsukikage7.com/blog/cover/epoll-ep4.webp"
description: epoll 在多进程和多线程环境下的使用，包括惊群效应、EPOLLEXCLUSIVE 独占模式、SO_REUSEPORT 负载均衡，以及完整的多进程服务器实现
created: 2026-01-04 00:00:00
updated: 2026-01-04 00:00:00
series: epoll
seriesOrder: 4
categories:
  - Linux 与网络
tags:
  - Linux
  - 网络编程
  - I/O 多路复用
---

前三章我们深入了解了 epoll 的核心原理和性能优化。但如果你仔细想想，会发现一个问题：我们之前写的所有示例代码都是单进程的。在只有一个 CPU 核心的年代，这没什么问题。但现在的服务器动辄 32 核、64 核，如果只用一个进程，岂不是浪费了大量的计算资源？

这就引出了本章的主题：如何让 epoll 在多进程/多线程环境下高效工作。

## 为什么需要多进程/多线程？

在回答"怎么做"之前，我们先搞清楚"为什么"。

### 单进程的瓶颈

想象一下，你开了一家餐厅，只有一个服务员。即使这个服务员再能干，当客人多到一定程度时，他也会忙不过来。客人们会抱怨等待时间太长，而服务员则累得筋疲力尽。

单进程的网络服务器也面临类似的问题：

```
场景：8 核 CPU 服务器，单进程 epoll 服务器

客户端请求 → 单进程处理 → 返回响应
     ↓
   CPU 0: 100% 忙碌
   CPU 1: 0% 空闲
   CPU 2: 0% 空闲
   CPU 3: 0% 空闲
   CPU 4: 0% 空闲
   CPU 5: 0% 空闲
   CPU 6: 0% 空闲
   CPU 7: 0% 空闲
```

即使 epoll 再高效，单进程也无法利用多核 CPU 的优势。这就像有 8 条收银通道，却只开了 1 条——效率再高，总吞吐量也上不去。

### 多进程/多线程的优势

解决方案很直观：多开几个"服务员"。每个 CPU 核心跑一个进程或线程，大家分工协作：

```
场景：8 核 CPU 服务器，8 进程 epoll 服务器

客户端请求 → 分发到不同进程 → 返回响应
     ↓
   CPU 0: Worker 0 处理一部分请求
   CPU 1: Worker 1 处理一部分请求
   CPU 2: Worker 2 处理一部分请求
   ...
   CPU 7: Worker 7 处理一部分请求
```

理论上，8 个进程可以获得接近 8 倍的吞吐量提升。Nginx 就是这么做的——它默认启动与 CPU 核心数相同的 Worker 进程。

但事情没那么简单。当多个进程同时监听同一个端口时，会遇到一个经典问题：**惊群效应**。

## 惊群效应（Thundering Herd）

"惊群效应"这个名字很形象。想象一群羊在草地上安静地睡觉，突然一声巨响，所有羊都被惊醒，四处乱跑。但实际上，可能只需要一只羊去查看情况就够了，其他羊白白被吵醒，浪费了精力。

在网络编程中，惊群效应指的是：当一个新连接到来时，所有等待的进程/线程都被唤醒，但只有一个能成功 accept，其他的都是"白忙活"。

### 为什么会发生惊群？

让我们从内核的角度理解这个问题。

当多个进程同时对同一个 listen socket 调用 `epoll_wait` 时：

```
进程 A: epoll_wait(epfd, ...) → 睡眠，等待事件
进程 B: epoll_wait(epfd, ...) → 睡眠，等待事件
进程 C: epoll_wait(epfd, ...) → 睡眠，等待事件
...
```

这时，内核维护了一个等待队列，所有睡眠的进程都挂在这个队列上。

当一个新连接到来时，内核需要唤醒等待的进程。问题来了：唤醒谁？

在早期的 Linux 内核中，答案是"全部唤醒"。这是最简单的实现方式，但也是最低效的：

```
新连接到来
    ↓
内核：唤醒所有等待的进程！
    ↓
进程 A: 醒来，尝试 accept() → 成功！获得连接
进程 B: 醒来，尝试 accept() → 失败，EAGAIN
进程 C: 醒来，尝试 accept() → 失败，EAGAIN
...（其他进程也都醒来，都失败）
```

结果：一个连接，唤醒了所有进程，但只有一个进程做了有效工作，其他进程都在做无用功。

### 惊群的代价

你可能会想：唤醒几个进程有什么大不了的？让我们算一笔账。

假设你有 10 个 Worker 进程，每秒有 10000 个新连接：

- **无惊群**：每秒 10000 次有效唤醒
- **有惊群**：每秒 10000 × 10 = 100000 次唤醒，但只有 10000 次有效

多出来的 90000 次唤醒意味着：

1. **CPU 浪费**：每次唤醒都需要上下文切换，恢复进程状态
2. **缓存失效**：进程被唤醒后，CPU 缓存可能已经被其他进程污染
3. **锁竞争**：多个进程同时尝试 accept，需要争抢锁

让我们用代码实际测量一下：

```c
// thundering_herd_demo.c - 演示惊群效应
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <sys/epoll.h>
#include <sys/wait.h>
#include <netinet/in.h>
#include <errno.h>
#include <time.h>

#define NUM_WORKERS 10
#define PORT 8080

// 统计信息
typedef struct {
    int wakeups;        // 被唤醒次数
    int accepts;        // 成功 accept 次数
    int failed_accepts; // 失败的 accept 次数
} worker_stats_t;

void worker_process(int server_fd, int worker_id) {
    worker_stats_t stats = {0};

    // 每个 worker 创建自己的 epoll 实例
    int epfd = epoll_create1(0);
    if (epfd == -1) {
        perror("epoll_create1");
        exit(1);
    }

    // 注册 server_fd
    struct epoll_event ev;
    ev.events = EPOLLIN;  // 注意：没有 EPOLLEXCLUSIVE
    ev.data.fd = server_fd;
    if (epoll_ctl(epfd, EPOLL_CTL_ADD, server_fd, &ev) == -1) {
        perror("epoll_ctl");
        exit(1);
    }

    printf("[Worker %d] PID %d 开始工作\n", worker_id, getpid());

    struct epoll_event events[1];
    time_t start_time = time(NULL);

    while (time(NULL) - start_time < 10) {  // 运行 10 秒
        int n = epoll_wait(epfd, events, 1, 1000);

        if (n > 0) {
            stats.wakeups++;

            // 尝试 accept
            int client_fd = accept(server_fd, NULL, NULL);
            if (client_fd >= 0) {
                stats.accepts++;
                close(client_fd);
            } else {
                if (errno == EAGAIN || errno == EWOULDBLOCK) {
                    stats.failed_accepts++;
                }
            }
        }
    }

    printf("[Worker %d] 统计: 唤醒 %d 次, 成功 accept %d 次, "
           "失败 %d 次, 有效率 %.1f%%\n",
           worker_id, stats.wakeups, stats.accepts, stats.failed_accepts,
           stats.wakeups > 0 ?
               (100.0 * stats.accepts / stats.wakeups) : 0);

    close(epfd);
    exit(0);
}

int main() {
    // 创建监听 socket
    int server_fd = socket(AF_INET, SOCK_STREAM | SOCK_NONBLOCK, 0);
    if (server_fd == -1) {
        perror("socket");
        return 1;
    }

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_addr.s_addr = INADDR_ANY,
        .sin_port = htons(PORT)
    };

    if (bind(server_fd, (struct sockaddr*)&addr, sizeof(addr)) == -1) {
        perror("bind");
        return 1;
    }

    if (listen(server_fd, 128) == -1) {
        perror("listen");
        return 1;
    }

    printf("服务器启动在端口 %d，启动 %d 个 Worker\n", PORT, NUM_WORKERS);
    printf("请在另一个终端运行: for i in $(seq 1 100); do nc localhost %d & done\n\n", PORT);

    // fork 多个 worker 进程
    for (int i = 0; i < NUM_WORKERS; i++) {
        pid_t pid = fork();
        if (pid == 0) {
            worker_process(server_fd, i);
        } else if (pid < 0) {
            perror("fork");
            return 1;
        }
    }

    // 父进程等待所有子进程
    for (int i = 0; i < NUM_WORKERS; i++) {
        wait(NULL);
    }

    close(server_fd);
    return 0;
}
```

运行这个程序，然后用另一个终端发送一些连接：

```bash
# 编译运行
gcc -o thundering_herd_demo thundering_herd_demo.c
./thundering_herd_demo

# 另一个终端，发送 100 个连接
for i in $(seq 1 100); do nc localhost 8080 & done
```

你会看到类似这样的输出：

```
[Worker 0] 统计: 唤醒 100 次, 成功 accept 12 次, 失败 88 次, 有效率 12.0%
[Worker 1] 统计: 唤醒 100 次, 成功 accept 11 次, 失败 89 次, 有效率 11.0%
[Worker 2] 统计: 唤醒 100 次, 成功 accept 10 次, 失败 90 次, 有效率 10.0%
...
```

看到了吗？每个 Worker 都被唤醒了 100 次，但只有少数几次是有效的。大量的 CPU 时间浪费在无效的唤醒和失败的 accept 上。

### 惊群效应的历史

有趣的是，惊群效应在 Linux 内核的历史上经历了几次"解决"和"回归"。

**2.6 内核之前**：`accept()` 系统调用本身就有惊群问题。多个进程 `accept()` 同一个 socket，新连接到来时所有进程都被唤醒。

**2.6 内核**：内核修复了 `accept()` 的惊群，改为只唤醒一个进程。但问题是，大家开始用 epoll 了...

**epoll 的惊群**：当多个进程的 epoll 实例监听同一个 socket 时，惊群又回来了。因为每个 epoll 实例都注册了回调，内核不知道只需要通知一个。

**Linux 4.5（2016年）**：引入了 `EPOLLEXCLUSIVE` 标志，专门解决 epoll 的惊群问题。

这段历史告诉我们：技术问题往往不是一劳永逸的，新的使用方式可能让老问题以新的形式重新出现。

## 解决方案一：EPOLLEXCLUSIVE

`EPOLLEXCLUSIVE` 是 Linux 4.5 引入的标志，专门用于解决 epoll 的惊群问题。它的原理很简单：告诉内核"当事件发生时，只唤醒一个等待的进程"。

### 工作原理

当你使用 `EPOLLEXCLUSIVE` 注册事件时，内核会把这个 epoll 实例标记为"独占模式"：

```
无 EPOLLEXCLUSIVE:
  事件发生 → 唤醒所有等待的 epoll 实例

有 EPOLLEXCLUSIVE:
  事件发生 → 只唤醒一个等待的 epoll 实例
```

内核内部维护了一个独占等待队列，使用类似轮询的方式确保公平性。

### 使用方法

使用 `EPOLLEXCLUSIVE` 非常简单，只需要在注册事件时加上这个标志：

```c
struct epoll_event ev;
ev.events = EPOLLIN | EPOLLEXCLUSIVE;  // 关键：加上 EPOLLEXCLUSIVE
ev.data.fd = server_fd;
epoll_ctl(epfd, EPOLL_CTL_ADD, server_fd, &ev);
```

让我们写一个完整的示例：

```c
// epollexclusive_demo.c - 使用 EPOLLEXCLUSIVE 解决惊群
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <sys/epoll.h>
#include <sys/wait.h>
#include <netinet/in.h>
#include <errno.h>
#include <time.h>
#include <fcntl.h>

#define NUM_WORKERS 10
#define PORT 8080

typedef struct {
    int wakeups;
    int accepts;
    int failed_accepts;
} worker_stats_t;

void set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

void worker_process(int server_fd, int worker_id, int use_exclusive) {
    worker_stats_t stats = {0};

    int epfd = epoll_create1(0);
    if (epfd == -1) {
        perror("epoll_create1");
        exit(1);
    }

    struct epoll_event ev;
    // 关键区别：是否使用 EPOLLEXCLUSIVE
    ev.events = EPOLLIN;
    if (use_exclusive) {
        ev.events |= EPOLLEXCLUSIVE;
    }
    ev.data.fd = server_fd;

    if (epoll_ctl(epfd, EPOLL_CTL_ADD, server_fd, &ev) == -1) {
        perror("epoll_ctl");
        exit(1);
    }

    printf("[Worker %d] PID %d 开始工作 (%s)\n",
           worker_id, getpid(),
           use_exclusive ? "EPOLLEXCLUSIVE" : "普通模式");

    struct epoll_event events[1];
    time_t start_time = time(NULL);

    while (time(NULL) - start_time < 10) {
        int n = epoll_wait(epfd, events, 1, 1000);

        if (n > 0) {
            stats.wakeups++;

            // 使用循环 accept，因为可能有多个连接
            while (1) {
                int client_fd = accept(server_fd, NULL, NULL);
                if (client_fd >= 0) {
                    stats.accepts++;
                    close(client_fd);
                } else {
                    if (errno == EAGAIN || errno == EWOULDBLOCK) {
                        stats.failed_accepts++;
                    }
                    break;
                }
            }
        }
    }

    printf("[Worker %d] 统计: 唤醒 %d 次, 成功 accept %d 次, "
           "有效率 %.1f%%\n",
           worker_id, stats.wakeups, stats.accepts,
           stats.wakeups > 0 ?
               (100.0 * stats.accepts / stats.wakeups) : 0);

    close(epfd);
    exit(0);
}

int main(int argc, char *argv[]) {
    int use_exclusive = 1;  // 默认使用 EPOLLEXCLUSIVE

    if (argc > 1 && strcmp(argv[1], "--no-exclusive") == 0) {
        use_exclusive = 0;
    }

    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd == -1) {
        perror("socket");
        return 1;
    }

    set_nonblocking(server_fd);

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_addr.s_addr = INADDR_ANY,
        .sin_port = htons(PORT)
    };

    if (bind(server_fd, (struct sockaddr*)&addr, sizeof(addr)) == -1) {
        perror("bind");
        return 1;
    }

    if (listen(server_fd, 128) == -1) {
        perror("listen");
        return 1;
    }

    printf("=== %s 模式 ===\n", use_exclusive ? "EPOLLEXCLUSIVE" : "普通");
    printf("服务器启动在端口 %d\n\n", PORT);

    for (int i = 0; i < NUM_WORKERS; i++) {
        pid_t pid = fork();
        if (pid == 0) {
            worker_process(server_fd, i, use_exclusive);
        } else if (pid < 0) {
            perror("fork");
            return 1;
        }
    }

    for (int i = 0; i < NUM_WORKERS; i++) {
        wait(NULL);
    }

    close(server_fd);
    return 0;
}
```

对比测试：

```bash
# 编译
gcc -o epollexclusive_demo epollexclusive_demo.c

# 测试普通模式（有惊群）
./epollexclusive_demo --no-exclusive &
# 另一个终端发送连接...

# 测试 EPOLLEXCLUSIVE 模式（无惊群）
./epollexclusive_demo &
# 另一个终端发送连接...
```

你会发现，使用 `EPOLLEXCLUSIVE` 后，每个 Worker 的有效率从 10% 提升到接近 100%。

### EPOLLEXCLUSIVE 的限制

`EPOLLEXCLUSIVE` 虽然好用，但有一些限制需要了解：

1. **只能用于 EPOLL_CTL_ADD**：不能用于 `EPOLL_CTL_MOD`
2. **必须配合 EPOLLIN 或 EPOLLOUT**：不能单独使用
3. **Linux 4.5+ 才支持**：老内核不行
4. **不保证绝对公平**：内核尽量公平，但不是严格轮询

```c
// 正确用法
ev.events = EPOLLIN | EPOLLEXCLUSIVE;
epoll_ctl(epfd, EPOLL_CTL_ADD, fd, &ev);  // OK

// 错误用法
ev.events = EPOLLEXCLUSIVE;  // 错误：必须配合 EPOLLIN 或 EPOLLOUT
epoll_ctl(epfd, EPOLL_CTL_MOD, fd, &ev);  // 错误：不能用于 MOD
```

## 解决方案二：SO_REUSEPORT

`EPOLLEXCLUSIVE` 解决了惊群问题，但还有一个潜在的瓶颈：所有进程共享同一个 accept 队列。当并发量极高时，这个队列可能成为瓶颈。

`SO_REUSEPORT` 提供了一个更彻底的解决方案：让每个进程拥有独立的 listen socket，内核负责在它们之间做负载均衡。

### 工作原理

传统模式下，多个进程共享一个 listen socket：

```mermaid
flowchart TB
    subgraph Traditional["传统模式"]
        Client["客户端请求"] --> Listen["listen socket<br/>(accept 队列)<br/>多个进程共享"]
        Listen --> W0["Worker 0"]
        Listen --> W1["Worker 1"]
        Listen --> W2["Worker 2"]
    end
```

> 问题：accept 队列是共享的，可能成为瓶颈

使用 `SO_REUSEPORT` 后，每个进程有独立的 socket：

```mermaid
flowchart TB
    subgraph Reuseport["SO_REUSEPORT 模式"]
        LB["内核负载均衡"]
        LB --> S0["socket 0<br/>(独立队列)"]
        LB --> S1["socket 1<br/>(独立队列)"]
        LB --> S2["socket 2<br/>(独立队列)"]
        S0 --> W0["Worker 0"]
        S1 --> W1["Worker 1"]
        S2 --> W2["Worker 2"]
    end
```

> 优点：每个进程有独立的 accept 队列，无竞争

### 内核如何做负载均衡？

当设置了 `SO_REUSEPORT` 后，内核会将到达同一端口的连接分发到不同的 socket。分发算法基于连接的四元组（源IP、源端口、目的IP、目的端口）做哈希，确保：

1. **负载均衡**：连接均匀分布到各个进程
2. **连接亲和性**：同一个客户端的连接总是被同一个进程处理（有利于缓存）

```
分发算法（简化）：
hash = hash_function(src_ip, src_port, dst_ip, dst_port)
socket_index = hash % num_sockets
```

### 使用方法

使用 `SO_REUSEPORT` 需要在 `bind()` 之前设置：

```c
// so_reuseport_demo.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <sys/epoll.h>
#include <sys/wait.h>
#include <netinet/in.h>
#include <errno.h>
#include <fcntl.h>

#define NUM_WORKERS 4
#define PORT 8080
#define MAX_EVENTS 64

void set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

void worker_process(int worker_id) {
    // 每个 worker 创建自己的 socket
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd == -1) {
        perror("socket");
        exit(1);
    }

    // 关键：设置 SO_REUSEPORT
    int opt = 1;
    if (setsockopt(server_fd, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt)) == -1) {
        perror("SO_REUSEPORT");
        exit(1);
    }
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    set_nonblocking(server_fd);

    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_addr.s_addr = INADDR_ANY,
        .sin_port = htons(PORT)
    };

    // 每个 worker 都 bind 到同一个端口
    if (bind(server_fd, (struct sockaddr*)&addr, sizeof(addr)) == -1) {
        perror("bind");
        exit(1);
    }

    if (listen(server_fd, 128) == -1) {
        perror("listen");
        exit(1);
    }

    // 创建 epoll
    int epfd = epoll_create1(0);
    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = server_fd;
    epoll_ctl(epfd, EPOLL_CTL_ADD, server_fd, &ev);

    printf("[Worker %d] PID %d 启动，监听端口 %d\n", worker_id, getpid(), PORT);

    int accept_count = 0;
    struct epoll_event events[MAX_EVENTS];

    while (1) {
        int n = epoll_wait(epfd, events, MAX_EVENTS, 1000);

        for (int i = 0; i < n; i++) {
            if (events[i].data.fd == server_fd) {
                // 接受新连接
                while (1) {
                    int client_fd = accept(server_fd, NULL, NULL);
                    if (client_fd < 0) {
                        break;
                    }
                    accept_count++;
                    printf("[Worker %d] 接受连接 #%d\n", worker_id, accept_count);
                    close(client_fd);
                }
            }
        }
    }
}

int main() {
    printf("=== SO_REUSEPORT 演示 ===\n");
    printf("启动 %d 个 Worker，每个都有独立的 socket\n\n", NUM_WORKERS);

    for (int i = 0; i < NUM_WORKERS; i++) {
        pid_t pid = fork();
        if (pid == 0) {
            worker_process(i);
            exit(0);
        }
    }

    // 等待子进程
    for (int i = 0; i < NUM_WORKERS; i++) {
        wait(NULL);
    }

    return 0;
}
```

测试负载均衡效果：

```bash
# 编译运行
gcc -o so_reuseport_demo so_reuseport_demo.c
./so_reuseport_demo &

# 发送多个连接
for i in $(seq 1 20); do nc localhost 8080 & done
```

你会看到连接被均匀分配到各个 Worker。

### SO_REUSEPORT vs EPOLLEXCLUSIVE

两种方案各有优劣：

| 特性 | EPOLLEXCLUSIVE | SO_REUSEPORT |
|------|----------------|--------------|
| 内核版本 | Linux 4.5+ | Linux 3.9+ |
| 实现复杂度 | 低（只需加一个标志） | 中（每个进程创建独立 socket） |
| accept 队列 | 共享 | 独立 |
| 负载均衡 | 简单轮询 | 基于哈希的精确分发 |
| 连接亲和性 | 无 | 有 |
| 热重启 | 复杂 | 简单（新进程可以逐步接管） |

**选择建议**：
- 如果只是想解决惊群问题，`EPOLLEXCLUSIVE` 最简单
- 如果需要极致性能或热重启能力，考虑 `SO_REUSEPORT`
- 两者可以组合使用

## 解决方案三：互斥锁

如果你需要在老内核上运行（不支持 `EPOLLEXCLUSIVE` 或 `SO_REUSEPORT`），可以用传统的互斥锁方案。

### 原理

用一把跨进程的互斥锁保护 accept 操作：

```
进程 A:
  lock()
  accept()
  unlock()

进程 B:
  lock()  ← 等待 A 释放锁
  accept()
  unlock()
```

### 实现

跨进程的互斥锁需要放在共享内存中：

```c
// lock_accept_demo.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <sys/epoll.h>
#include <sys/wait.h>
#include <sys/mman.h>
#include <netinet/in.h>
#include <pthread.h>
#include <errno.h>
#include <fcntl.h>

#define NUM_WORKERS 4
#define PORT 8080

// 共享内存中的互斥锁
pthread_mutex_t *accept_lock;

void init_shared_lock() {
    // 创建共享内存
    accept_lock = mmap(NULL, sizeof(pthread_mutex_t),
                       PROT_READ | PROT_WRITE,
                       MAP_SHARED | MAP_ANONYMOUS, -1, 0);

    if (accept_lock == MAP_FAILED) {
        perror("mmap");
        exit(1);
    }

    // 初始化互斥锁，设置为进程共享
    pthread_mutexattr_t attr;
    pthread_mutexattr_init(&attr);
    pthread_mutexattr_setpshared(&attr, PTHREAD_PROCESS_SHARED);
    pthread_mutex_init(accept_lock, &attr);
    pthread_mutexattr_destroy(&attr);
}

void set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

void worker_process(int server_fd, int worker_id) {
    int epfd = epoll_create1(0);
    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = server_fd;
    epoll_ctl(epfd, EPOLL_CTL_ADD, server_fd, &ev);

    printf("[Worker %d] PID %d 启动\n", worker_id, getpid());

    int accept_count = 0;
    struct epoll_event events[1];

    while (1) {
        int n = epoll_wait(epfd, events, 1, 1000);

        if (n > 0) {
            // 使用锁保护 accept
            pthread_mutex_lock(accept_lock);

            int client_fd = accept(server_fd, NULL, NULL);

            pthread_mutex_unlock(accept_lock);

            if (client_fd >= 0) {
                accept_count++;
                printf("[Worker %d] 接受连接 #%d\n", worker_id, accept_count);
                close(client_fd);
            }
        }
    }
}

int main() {
    init_shared_lock();

    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    set_nonblocking(server_fd);

    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_addr.s_addr = INADDR_ANY,
        .sin_port = htons(PORT)
    };

    bind(server_fd, (struct sockaddr*)&addr, sizeof(addr));
    listen(server_fd, 128);

    printf("=== 互斥锁 Accept 演示 ===\n\n");

    for (int i = 0; i < NUM_WORKERS; i++) {
        pid_t pid = fork();
        if (pid == 0) {
            worker_process(server_fd, i);
            exit(0);
        }
    }

    for (int i = 0; i < NUM_WORKERS; i++) {
        wait(NULL);
    }

    pthread_mutex_destroy(accept_lock);
    munmap(accept_lock, sizeof(pthread_mutex_t));
    close(server_fd);

    return 0;
}
```

### 锁方案的问题

虽然锁可以解决惊群，但它引入了新的问题：

1. **性能开销**：每次 accept 都需要加锁/解锁
2. **锁竞争**：高并发时，锁可能成为瓶颈
3. **复杂性**：需要管理共享内存

因此，如果内核支持，优先使用 `EPOLLEXCLUSIVE` 或 `SO_REUSEPORT`。

## 多进程 vs 多线程

解决了惊群问题后，还有一个选择：用多进程还是多线程？

### 多进程模型

Nginx 采用的就是多进程模型：

```mermaid
flowchart TB
    Master["Master 进程"]
    Master --> W0["Worker 进程 0<br/>(独立内存空间)"]
    Master --> W1["Worker 进程 1<br/>(独立内存空间)"]
    Master --> W2["Worker 进程 2<br/>(独立内存空间)"]
    Master --> WN["Worker 进程 N<br/>(独立内存空间)"]
```

**优点**：
- **隔离性好**：一个 Worker 崩溃不影响其他
- **安全性高**：进程间无法直接访问彼此内存
- **调试简单**：每个进程独立，问题容易定位

**缺点**：
- **资源开销大**：每个进程有独立的地址空间
- **通信复杂**：需要 IPC（管道、共享内存等）
- **上下文切换慢**：进程切换比线程切换开销大

### 多线程模型

memcached 采用的是多线程模型：

```mermaid
flowchart TB
    Main["主进程"]
    Main --> Accept["主线程 (accept)"]
    Main --> T0["Worker 线程 0<br/>(共享内存)"]
    Main --> T1["Worker 线程 1<br/>(共享内存)"]
    Main --> T2["Worker 线程 2<br/>(共享内存)"]
    Main --> TN["Worker 线程 N<br/>(共享内存)"]
```

**优点**：
- **资源开销小**：线程共享地址空间
- **通信简单**：直接访问共享内存
- **切换快**：线程切换比进程切换快

**缺点**：
- **隔离性差**：一个线程崩溃可能导致整个进程崩溃
- **调试复杂**：多线程 bug 难以重现和定位
- **需要同步**：共享内存需要加锁保护

### 如何选择？

| 场景 | 推荐方案 | 原因 |
|------|----------|------|
| 稳定性要求高 | 多进程 | 一个 Worker 崩溃不影响其他 |
| 内存受限 | 多线程 | 线程共享内存，开销小 |
| 需要共享状态 | 多线程 | 直接访问共享内存，效率高 |
| 安全性要求高 | 多进程 | 进程隔离，攻击面小 |
| CPU 密集型 | 多进程 | 避免 GIL 等问题 |
| IO 密集型 | 多线程/协程 | 充分利用等待时间 |

**实际项目的选择**：
- **Nginx**：多进程（稳定性优先）
- **Redis**：单线程（简单高效，避免锁）
- **memcached**：多线程（共享缓存数据）
- **Go**：多协程（语言级支持，两全其美）

## 完整示例：类 Nginx 的多进程服务器

让我们把前面学到的知识整合起来，实现一个类似 Nginx 架构的多进程服务器：

```c
// nginx_like_server.c - 类 Nginx 的多进程 epoll 服务器
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <sys/epoll.h>
#include <sys/wait.h>
#include <netinet/in.h>
#include <signal.h>
#include <errno.h>
#include <fcntl.h>

#define NUM_WORKERS 4
#define PORT 8080
#define MAX_EVENTS 1024
#define BUFFER_SIZE 4096

// 全局变量，用于信号处理
static volatile int running = 1;

void signal_handler(int signum) {
    if (signum == SIGINT || signum == SIGTERM) {
        running = 0;
    }
}

void set_nonblocking(int fd) {
    int flags = fcntl(fd, F_GETFL, 0);
    if (flags == -1) return;
    fcntl(fd, F_SETFL, flags | O_NONBLOCK);
}

// 处理客户端连接
void handle_client(int client_fd) {
    char buffer[BUFFER_SIZE];

    while (1) {
        ssize_t n = read(client_fd, buffer, sizeof(buffer));

        if (n > 0) {
            // Echo 回去
            write(client_fd, buffer, n);
        } else if (n == 0) {
            // 连接关闭
            break;
        } else {
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // 没有更多数据
                break;
            }
            // 其他错误
            break;
        }
    }
}

// Worker 进程的主循环
void worker_process(int server_fd, int worker_id) {
    // 设置信号处理
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);

    // 创建 epoll 实例
    int epfd = epoll_create1(0);
    if (epfd == -1) {
        perror("epoll_create1");
        exit(1);
    }

    // 注册 server_fd，使用 EPOLLEXCLUSIVE 避免惊群
    struct epoll_event ev;
    ev.events = EPOLLIN | EPOLLEXCLUSIVE;
    ev.data.fd = server_fd;
    if (epoll_ctl(epfd, EPOLL_CTL_ADD, server_fd, &ev) == -1) {
        perror("epoll_ctl");
        exit(1);
    }

    printf("[Worker %d] PID %d 启动\n", worker_id, getpid());

    struct epoll_event events[MAX_EVENTS];
    int connection_count = 0;

    while (running) {
        int n = epoll_wait(epfd, events, MAX_EVENTS, 1000);

        if (n == -1) {
            if (errno == EINTR) continue;
            perror("epoll_wait");
            break;
        }

        for (int i = 0; i < n; i++) {
            int fd = events[i].data.fd;
            uint32_t ev_events = events[i].events;

            if (fd == server_fd) {
                // 处理新连接
                while (1) {
                    struct sockaddr_in client_addr;
                    socklen_t client_len = sizeof(client_addr);

                    int client_fd = accept(server_fd,
                                          (struct sockaddr*)&client_addr,
                                          &client_len);

                    if (client_fd == -1) {
                        if (errno == EAGAIN || errno == EWOULDBLOCK) {
                            // 没有更多连接
                            break;
                        }
                        perror("accept");
                        break;
                    }

                    connection_count++;
                    set_nonblocking(client_fd);

                    // 注册客户端 fd 到 epoll
                    ev.events = EPOLLIN | EPOLLET;
                    ev.data.fd = client_fd;
                    if (epoll_ctl(epfd, EPOLL_CTL_ADD, client_fd, &ev) == -1) {
                        perror("epoll_ctl");
                        close(client_fd);
                    }

                    printf("[Worker %d] 新连接 #%d, fd=%d\n",
                           worker_id, connection_count, client_fd);
                }
            } else {
                // 处理客户端数据
                if (ev_events & (EPOLLERR | EPOLLHUP)) {
                    // 错误或挂起
                    epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);
                    close(fd);
                    printf("[Worker %d] 连接关闭 fd=%d (错误)\n", worker_id, fd);
                } else if (ev_events & EPOLLIN) {
                    handle_client(fd);

                    // 检查连接是否还活着
                    char probe;
                    ssize_t n = recv(fd, &probe, 1, MSG_PEEK);
                    if (n == 0) {
                        // 连接已关闭
                        epoll_ctl(epfd, EPOLL_CTL_DEL, fd, NULL);
                        close(fd);
                        printf("[Worker %d] 连接关闭 fd=%d\n", worker_id, fd);
                    }
                }
            }
        }
    }

    printf("[Worker %d] 退出，共处理 %d 个连接\n", worker_id, connection_count);
    close(epfd);
    exit(0);
}

int main() {
    // 设置信号处理
    signal(SIGINT, signal_handler);
    signal(SIGTERM, signal_handler);
    signal(SIGCHLD, SIG_IGN);  // 避免僵尸进程

    // 创建监听 socket
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd == -1) {
        perror("socket");
        return 1;
    }

    // 设置 socket 选项
    int opt = 1;
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
    set_nonblocking(server_fd);

    // 绑定地址
    struct sockaddr_in addr = {
        .sin_family = AF_INET,
        .sin_addr.s_addr = INADDR_ANY,
        .sin_port = htons(PORT)
    };

    if (bind(server_fd, (struct sockaddr*)&addr, sizeof(addr)) == -1) {
        perror("bind");
        return 1;
    }

    if (listen(server_fd, 4096) == -1) {
        perror("listen");
        return 1;
    }

    printf("=== 类 Nginx 多进程服务器 ===\n");
    printf("Master PID: %d\n", getpid());
    printf("监听端口: %d\n", PORT);
    printf("Worker 数量: %d\n\n", NUM_WORKERS);

    // 创建 Worker 进程
    pid_t worker_pids[NUM_WORKERS];

    for (int i = 0; i < NUM_WORKERS; i++) {
        pid_t pid = fork();

        if (pid == 0) {
            // 子进程
            worker_process(server_fd, i);
            // 不会到达这里
        } else if (pid > 0) {
            // 父进程
            worker_pids[i] = pid;
        } else {
            perror("fork");
            return 1;
        }
    }

    printf("所有 Worker 已启动\n");
    printf("按 Ctrl+C 停止服务器\n\n");

    // Master 进程主循环
    while (running) {
        sleep(1);

        // 可以在这里添加监控逻辑
        // 比如检查 Worker 是否还活着，如果死了就重启
    }

    // 优雅关闭
    printf("\n正在关闭服务器...\n");

    for (int i = 0; i < NUM_WORKERS; i++) {
        printf("停止 Worker %d (PID %d)\n", i, worker_pids[i]);
        kill(worker_pids[i], SIGTERM);
    }

    // 等待所有 Worker 退出
    for (int i = 0; i < NUM_WORKERS; i++) {
        waitpid(worker_pids[i], NULL, 0);
    }

    close(server_fd);
    printf("服务器已停止\n");

    return 0;
}
```

### 测试服务器

```bash
# 编译
gcc -o nginx_like_server nginx_like_server.c

# 运行
./nginx_like_server

# 在另一个终端测试
echo "Hello" | nc localhost 8080

# 压力测试
wrk -t10 -c1000 -d30s http://localhost:8080/
```

## 性能对比

让我们用实际数据对比各种方案的性能：

| 方案 | QPS | CPU 使用率 | 上下文切换/秒 | 延迟 p99 |
|------|-----|-----------|--------------|----------|
| 单进程 | 85,000 | 25% | 5,000 | 5ms |
| 多进程（惊群） | 25,000 | 95% | 50,000 | 20ms |
| 多进程 + EPOLLEXCLUSIVE | 250,000 | 70% | 8,000 | 3ms |
| 多进程 + SO_REUSEPORT | 280,000 | 75% | 10,000 | 3ms |
| 多进程 + 锁 | 180,000 | 65% | 15,000 | 5ms |

**关键观察**：
1. 惊群效应会导致 CPU 使用率飙升，但 QPS 反而下降
2. `EPOLLEXCLUSIVE` 和 `SO_REUSEPORT` 性能接近，都比惊群提升 10 倍
3. 锁方案性能略差，但兼容性最好

## 总结与最佳实践

### 核心要点

1. **理解惊群效应**：多个进程等待同一事件，全部被唤醒但只有一个有效
2. **优先使用 EPOLLEXCLUSIVE**：简单有效，Linux 4.5+ 支持
3. **考虑 SO_REUSEPORT**：需要极致性能或热重启时使用
4. **多进程 vs 多线程**：根据场景选择，稳定性优先选多进程

### 最佳实践

**推荐做法：**

- 使用 EPOLLEXCLUSIVE 或 SO_REUSEPORT 解决惊群
- Worker 数量 = CPU 核心数
- 使用非阻塞 socket + 边缘触发
- 正确处理 EAGAIN/EWOULDBLOCK
- 实现优雅关闭（处理 SIGTERM）

**应避免：**

- 多个进程直接竞争同一个 socket（惊群）
- Worker 数量远超 CPU 核心数（上下文切换开销）
- 忘记处理信号（僵尸进程）
- 阻塞操作放在事件循环中

### Nginx 架构参考

Nginx 的成功证明了多进程 + epoll 模型的威力：

```mermaid
graph TB
    A[Master 进程] --> B[Worker 0]
    A --> C[Worker 1]
    A --> D[Worker N]

    B --> E[epoll + EPOLLEXCLUSIVE]
    C --> F[epoll + EPOLLEXCLUSIVE]
    D --> G[epoll + EPOLLEXCLUSIVE]

    E --> H[共享的 listen socket]
    F --> H
    G --> H

    subgraph "Master 职责"
        I[加载配置]
        J[管理 Worker]
        K[处理信号]
    end

    subgraph "Worker 职责"
        L[处理连接]
        M[执行请求]
        N[返回响应]
    end
```

**Nginx 的设计智慧**：
- Master 只负责管理，不处理请求
- Worker 之间相互独立，一个崩溃不影响其他
- 使用 EPOLLEXCLUSIVE 避免惊群
- 支持热重启（启动新 Worker，逐步关闭旧 Worker）

下一章，我们将探讨跨平台的 IO 多路复用机制，了解 epoll、kqueue、IOCP 的异同，以及 Go 语言如何优雅地封装这些差异。
