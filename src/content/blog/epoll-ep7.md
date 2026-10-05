---
title: "[epoll] EP7 监控与调试"
image: "https://assets.tsukikage7.com/blog/cover/epoll-ep7.webp"
description: epoll 的性能监控工具、常见问题诊断、性能瓶颈定位，以及实战中的调试技巧
created: 2026-01-07 00:00:00
updated: 2026-01-07 00:00:00
series: epoll
seriesOrder: 7
categories:
  - Linux 与网络
tags:
  - Linux
  - 网络编程
  - I/O 多路复用
---

代码写完上线，只是万里长征的第一步。生产环境中，各种诡异的问题会层出不穷：性能突然下降、内存持续增长、连接莫名断开……这时候，监控和调试能力就成了区分"能写代码"和"能解决问题"的分水岭。

这一章，我们将学习如何监控 epoll 应用的运行状态，诊断常见问题，以及定位性能瓶颈。这些技能，是成为高级开发者的必经之路。

## 监控的哲学：看见才能改进

在深入具体工具之前，我们先聊聊监控的思维方式。

### 黑盒与白盒

监控分为两种视角：

**黑盒监控**：从外部观察系统行为
- 响应时间是多少？
- 成功率如何？
- QPS 能到多少？

这就像医生看病人的外在症状——发烧、咳嗽、乏力。

**白盒监控**：深入系统内部观察
- CPU 花在哪里？
- 内存是如何分布的？
- 系统调用执行了多少次？

这就像 CT 扫描和验血——看到身体内部的真实情况。

对于 epoll 应用，我们两者都需要。黑盒告诉你"出了问题"，白盒告诉你"为什么出问题"。

### 监控的四个黄金指标

Google SRE 提出了四个黄金指标，对任何服务都适用：

1. **延迟（Latency）**：请求处理需要多长时间
2. **流量（Traffic）**：系统承受的请求量
3. **错误（Errors）**：失败请求的比例
4. **饱和度（Saturation）**：资源的使用程度

对于 epoll 应用，这意味着：
- `epoll_wait` 返回需要多久？
- 每秒处理多少个事件？
- 有多少次 `epoll_wait` 返回错误？
- 文件描述符用了多少？CPU 使用率如何？

带着这些问题，我们来看具体的工具。

## Linux 的透视镜：/proc 文件系统

Linux 有一个神奇的地方叫 `/proc`，它不是真正的文件系统，而是内核暴露的一个接口。通过读取这里的"文件"，你可以看到内核的内部状态。

对于调试 epoll 应用，`/proc` 是最直接的信息来源。

### 查看进程的文件描述符

每个进程打开的文件描述符都列在 `/proc/<pid>/fd/` 目录下：

```bash
$ ls -l /proc/1234/fd/
total 0
lrwx------ 1 user user 64 Jan  7 10:00 0 -> /dev/null
lrwx------ 1 user user 64 Jan  7 10:00 1 -> /dev/null
lrwx------ 1 user user 64 Jan  7 10:00 2 -> /dev/null
lrwx------ 1 user user 64 Jan  7 10:00 3 -> anon_inode:[eventpoll]
lrwx------ 1 user user 64 Jan  7 10:00 4 -> socket:[12345]
lrwx------ 1 user user 64 Jan  7 10:00 5 -> socket:[12346]
```

这里能看到：
- fd 0/1/2 是标准输入/输出/错误（重定向到了 /dev/null）
- fd 3 是 epoll 实例（anon_inode:[eventpoll]）
- fd 4/5 是网络连接（socket）

**实用技巧：监控文件描述符数量变化**

```bash
# 实时监控 fd 数量
watch -n 1 "ls /proc/1234/fd | wc -l"

# 如果 fd 数量持续增长，可能有泄漏
```

### 深入 epoll 实例的内部

想知道一个 epoll 实例具体监控了哪些文件描述符？`/proc/<pid>/fdinfo/<epfd>` 会告诉你：

```bash
$ cat /proc/1234/fdinfo/3
pos:    0
flags:  02
mnt_id: 13
ino:    12345
tfd:        4 events:       19 data: deadbeef00000000  pos:0 ino:67890 sdev:8
tfd:        5 events:       19 data: cafebabe00000000  pos:0 ino:67891 sdev:8
```

让我解读一下这些信息：

**tfd**（target fd）：被监控的文件描述符编号

**events**：事件掩码（十六进制）
- 0x19 = 0001 1001 = EPOLLIN(0x01) | EPOLLPRI(0x02) | EPOLLHUP(0x10)

**data**：用户设置的数据（通常是 fd 或指针）

这个信息在诊断"为什么事件没触发"时特别有用——先确认事件掩码是否正确设置。

### 系统级别的 epoll 限制

```bash
# 每个用户能创建的 epoll 实例数量上限
$ cat /proc/sys/fs/epoll/max_user_instances
1024

# 每个用户能监控的文件描述符总数上限
$ cat /proc/sys/fs/epoll/max_user_watches
108185
```

这些限制是根据系统内存自动计算的。如果你的应用需要监控大量连接，可能需要调整：

```bash
# 临时调整（重启后失效）
sudo sysctl -w fs.epoll.max_user_watches=200000

# 永久调整
echo "fs.epoll.max_user_watches=200000" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

## strace：追踪系统调用的利器

如果 `/proc` 是静态的 X 光片，那 `strace` 就是动态的心电图——它能实时显示进程正在做什么。

### 基本用法：看看进程在忙什么

```bash
# 附加到运行中的进程
$ strace -p 1234

# 输出示例：
epoll_wait(3, [{EPOLLIN, {u32=4, u64=4}}], 1024, -1) = 1
read(4, "GET / HTTP/1.1\r\nHost: example..."..., 4096) = 156
write(4, "HTTP/1.1 200 OK\r\nContent-Length..."..., 89) = 89
epoll_wait(3, [{EPOLLIN, {u32=4, u64=4}}], 1024, -1) = 1
```

这个输出告诉我们：进程正在一个典型的事件循环中——等待事件、读取请求、发送响应、再等待。

### 只看 epoll 相关的调用

```bash
strace -e trace=epoll_create1,epoll_ctl,epoll_wait -p 1234
```

这在调试 epoll 问题时很有用，过滤掉了其他系统调用的噪音。

### 统计系统调用：找到热点

```bash
$ strace -c -p 1234
# 运行一段时间后按 Ctrl+C

% time     seconds  usecs/call     calls    errors syscall
------ ----------- ----------- --------- --------- ----------------
 45.23    0.123456          12     10000           epoll_wait
 30.15    0.082345           8     10000           read
 20.12    0.055123           5     10000           write
  4.50    0.012345         123       100           epoll_ctl
```

这个统计能快速揭示问题：

- 如果 `epoll_wait` 占用时间过长，可能是超时设置不当
- 如果 `epoll_ctl` 调用次数过多，可能是频繁添加/删除 fd
- 如果 `read`/`write` 的 usecs/call 很高，可能是 IO 瓶颈

### strace 的性能开销

**警告**：strace 会显著降低被追踪进程的性能（通常是 10-100 倍）。在生产环境使用时要小心，建议：

- 只追踪短时间
- 只追踪特定的系统调用
- 考虑使用性能更好的替代工具（如 perf、bpftrace）

## perf：专业的性能分析

`perf` 是 Linux 内核自带的性能分析工具，功能强大，开销极低。

### 记录系统调用

```bash
# 记录 epoll_wait 的调用
perf record -e syscalls:sys_enter_epoll_wait \
            -e syscalls:sys_exit_epoll_wait \
            -p 1234

# 运行一段时间后按 Ctrl+C

# 查看报告
perf report
```

### 生成火焰图

火焰图是性能分析的神器，它能直观地展示 CPU 时间花在了哪里：

```bash
# 记录 CPU 采样
perf record -g -p 1234 -- sleep 30

# 生成火焰图（需要安装 FlameGraph 工具）
perf script | stackcollapse-perf.pl | flamegraph.pl > cpu.svg
```

火焰图的解读：
- 横轴是调用栈的"宽度"，代表时间占比
- 纵轴是调用栈深度
- 越宽的"火焰"越值得关注

### 追踪特定函数

```bash
# 追踪 ep_poll_callback（内核中的 epoll 回调）
perf probe -a ep_poll_callback
perf record -e probe:ep_poll_callback -p 1234
perf report
```

这在分析 epoll 内部行为时很有用。

## 实时监控：把握系统脉搏

### 网络连接状态：ss

`ss`（socket statistics）是 `netstat` 的现代替代品，速度更快：

```bash
# 查看 TCP 监听端口
$ ss -tlnp
State    Recv-Q Send-Q  Local Address:Port   Peer Address:Port Process
LISTEN   0      128     0.0.0.0:8080          0.0.0.0:*     users:(("server",pid=1234,fd=3))

# 查看建立的连接数
$ ss -tn state established | wc -l
15234

# 查看各状态的连接数
$ ss -tn state all | awk '{print $1}' | sort | uniq -c
    156 CLOSE-WAIT
  15234 ESTAB
      1 State
     23 TIME-WAIT
```

如果你看到大量 `CLOSE-WAIT`，说明你的应用没有正确关闭连接；大量 `TIME-WAIT` 通常是正常的，但如果太多可能导致端口耗尽。

### CPU 和上下文切换：pidstat

```bash
$ pidstat -p 1234 -w -u 1

10:00:01      UID       PID    %usr %system  %guest   %wait    %CPU   CPU  Command
10:00:02     1000      1234    5.00   15.00    0.00    0.00   20.00     0  server

10:00:01      UID       PID   cswch/s nvcswch/s  Command
10:00:02     1000      1234    1500.00      50.00  server
```

这里能看到：
- **%usr**：用户态 CPU 使用
- **%system**：内核态 CPU 使用（系统调用、中断等）
- **cswch/s**：自愿上下文切换（通常是等待 IO）
- **nvcswch/s**：非自愿上下文切换（被抢占）

如果 %system 远高于 %usr，说明系统调用开销大；如果 cswch/s 很高，说明频繁等待。

### 进程内存：/proc/status

```bash
$ cat /proc/1234/status | grep -E "VmSize|VmRSS|VmData|Threads"
VmSize:   234567 kB    # 虚拟内存总量
VmRSS:     45678 kB    # 实际使用的物理内存
VmData:    34567 kB    # 数据段大小
Threads:       8       # 线程数
```

定期记录这些值，可以发现内存泄漏的趋势。

## 常见问题的诊断思路

理论工具讲完了，现在来看实战。我会用"症状→假设→验证→解决"的思路来分析常见问题。

### 问题一：性能突然下降

**症状**：QPS 从稳定的 50K 突然降到 20K，响应时间从 10ms 升到 50ms。

**第一步：确认是 CPU 瓶颈还是 IO 瓶颈**

```bash
$ top -p 1234
  PID USER      PR  NI    VIRT    RES    SHR S  %CPU %MEM     TIME+ COMMAND
 1234 user      20   0  234567  45678  12345 S  95.0  2.3   10:23.45 server
```

CPU 95%，几乎打满了。是 CPU 瓶颈。

**第二步：看 CPU 花在哪里**

```bash
$ strace -c -p 1234
# 运行 10 秒后 Ctrl+C

% time     seconds  usecs/call     calls    errors syscall
 65.00    0.650000          65     10000           epoll_wait
 20.00    0.200000           2    100000           futex
 10.00    0.100000          10     10000           read
  5.00    0.050000           5     10000           write
```

`epoll_wait` 调用耗时明显增加（65 微秒 vs 正常应该是个位数），而且 `futex` 调用量很大。

**第三步：深入分析**

```bash
$ perf record -g -p 1234 -- sleep 10
$ perf report

# 发现大量时间花在锁等待上
```

**诊断结论**：锁竞争。可能是多个线程同时操作共享数据结构。

**解决方案**：
- 减少共享状态
- 使用更细粒度的锁
- 考虑无锁数据结构

### 问题二：内存持续增长

**症状**：服务运行几天后，内存从 500MB 涨到 2GB，最终 OOM。

**第一步：确认是真的内存泄漏还是正常增长**

```bash
# 每小时记录一次
$ cat /proc/1234/status | grep VmRSS
VmRSS:    512000 kB

# 一小时后
VmRSS:    524000 kB

# 又一小时后
VmRSS:    536000 kB
```

每小时增长约 12MB，是持续的泄漏。

**第二步：查看是什么在增长**

```bash
# 查看文件描述符数量
$ ls /proc/1234/fd | wc -l
5234

# 一小时后
$ ls /proc/1234/fd | wc -l
5456
```

文件描述符也在增长！很可能是 socket 或 epoll item 泄漏。

**第三步：验证假设**

```bash
$ ls -l /proc/1234/fd | grep socket | wc -l
5100

# 看看 epoll 监控了多少 fd
$ cat /proc/1234/fdinfo/3 | grep tfd | wc -l
5100
```

确认了：socket 连接创建后没有正确关闭。

**第四步：找到泄漏位置**

```bash
$ strace -e trace=socket,close -p 1234 2>&1 | head -100

socket(AF_INET, SOCK_STREAM, IPPROTO_TCP) = 234
# ... 处理 ...
# 没有看到 close(234)！
```

找到了！socket 创建后没有关闭。

**解决方案**：
- 检查所有创建 socket 的代码路径
- 确保错误处理分支也会关闭 socket
- 使用 RAII 或 defer 机制保证资源释放

### 问题三：惊群效应

**症状**：8 核机器跑着 8 个 worker 进程，CPU 使用率 100%，但 QPS 只有 10K（期望 80K）。

**第一步：看每个进程的状态**

```bash
$ pidstat -p 1234,1235,1236,1237,1238,1239,1240,1241 -w 1

PID   cswch/s nvcswch/s
1234   8500.00    100.00
1235   8450.00     98.00
1236   8520.00    102.00
...
```

每个进程的上下文切换都很高（8000+/s），这不正常。

**第二步：看系统调用**

```bash
$ strace -c -p 1234
% time     seconds  usecs/call     calls    errors syscall
 70.00    0.700000           7    100000     90000 accept4
 20.00    0.200000           2    100000           epoll_wait
```

90% 的 `accept4` 调用失败了！这是典型的惊群效应——所有进程被唤醒去 accept，但只有一个能成功。

**第三步：确认 epoll 配置**

```bash
$ strace -e trace=epoll_ctl -p 1234 | head -10
epoll_ctl(3, EPOLL_CTL_ADD, 4, {EPOLLIN, ...}) = 0
```

没有使用 `EPOLLEXCLUSIVE`。

**解决方案**：

```c
// 方案一：使用 EPOLLEXCLUSIVE
struct epoll_event event;
event.events = EPOLLIN | EPOLLEXCLUSIVE;
epoll_ctl(epfd, EPOLL_CTL_ADD, listen_fd, &event);

// 方案二：使用 SO_REUSEPORT，每个进程独立的 listen socket
int opt = 1;
setsockopt(listen_fd, SOL_SOCKET, SO_REUSEPORT, &opt, sizeof(opt));
```

### 问题四：事件丢失

**症状**：明明有数据到达，但 `epoll_wait` 没有返回。

**第一步：确认数据确实到达**

```bash
# 用 tcpdump 确认网络层面数据已到达
$ sudo tcpdump -i eth0 port 8080 -n

# 确实看到了数据包
10:00:01.123456 IP 192.168.1.100.54321 > 192.168.1.1.8080: Flags [P.], ...
```

**第二步：检查 socket 缓冲区**

```bash
$ ss -tn | grep 8080
ESTAB  4096  0  192.168.1.1:8080  192.168.1.100:54321
```

Recv-Q 是 4096，说明数据在接收缓冲区里，但没被读取。

**第三步：检查 epoll 配置**

```bash
$ cat /proc/1234/fdinfo/3 | grep "tfd: 5"
# 没有输出！
```

问题找到了：这个 socket 根本没有加入 epoll 监控。

**可能原因**：
1. `epoll_ctl` 返回错误被忽略了
2. 使用了 `EPOLLONESHOT` 但没有重新注册
3. 使用了边缘触发但没有读完数据

**排查步骤**：

```bash
# 检查是否使用了 EPOLLONESHOT
$ strace -e trace=epoll_ctl -p 1234 | grep EPOLLONESHOT

# 检查是否使用了边缘触发
$ strace -e trace=epoll_ctl -p 1234 | grep EPOLLET

# 检查 read 是否读到了 EAGAIN
$ strace -e trace=read -p 1234 | grep EAGAIN
```

## 构建自己的监控系统

生产环境中，手动敲命令是不够的，需要自动化的监控系统。

### 应用内指标收集

```c
#include <stdatomic.h>
#include <time.h>

typedef struct {
    atomic_uint_fast64_t epoll_wait_calls;
    atomic_uint_fast64_t epoll_wait_timeouts;
    atomic_uint_fast64_t events_processed;
    atomic_uint_fast64_t bytes_read;
    atomic_uint_fast64_t bytes_written;
    atomic_uint_fast64_t connections_accepted;
    atomic_uint_fast64_t connections_closed;
    time_t start_time;
} metrics_t;

static metrics_t g_metrics = {0};

// 初始化
void metrics_init(void) {
    g_metrics.start_time = time(NULL);
}

// 在事件循环中收集指标
void event_loop(int epfd) {
    struct epoll_event events[MAX_EVENTS];

    while (1) {
        atomic_fetch_add(&g_metrics.epoll_wait_calls, 1);

        int n = epoll_wait(epfd, events, MAX_EVENTS, 1000);

        if (n == 0) {
            atomic_fetch_add(&g_metrics.epoll_wait_timeouts, 1);
            continue;
        }

        atomic_fetch_add(&g_metrics.events_processed, n);

        // 处理事件...
    }
}

// 定期输出指标（可以改成发送到监控系统）
void metrics_report(void) {
    time_t now = time(NULL);
    double uptime = difftime(now, g_metrics.start_time);

    fprintf(stderr, "=== Metrics (uptime: %.0fs) ===\n", uptime);
    fprintf(stderr, "epoll_wait calls: %lu (%.1f/s)\n",
            g_metrics.epoll_wait_calls,
            g_metrics.epoll_wait_calls / uptime);
    fprintf(stderr, "events processed: %lu (%.1f/s)\n",
            g_metrics.events_processed,
            g_metrics.events_processed / uptime);
    fprintf(stderr, "bytes read: %lu (%.1f KB/s)\n",
            g_metrics.bytes_read,
            g_metrics.bytes_read / uptime / 1024);
}
```

### 结构化日志

调试时最有价值的往往是日志。但普通的文本日志很难分析，建议使用结构化日志：

```c
#include <stdio.h>
#include <time.h>

typedef enum {
    LOG_DEBUG,
    LOG_INFO,
    LOG_WARN,
    LOG_ERROR
} log_level_t;

static const char* level_names[] = {"DEBUG", "INFO", "WARN", "ERROR"};
static log_level_t current_level = LOG_INFO;

void log_event(log_level_t level, const char* event,
               const char* key1, const char* val1,
               const char* key2, const char* val2) {
    if (level < current_level) return;

    time_t now = time(NULL);
    struct tm* tm = localtime(&now);

    // JSON 格式，方便后续分析
    fprintf(stderr,
            "{\"time\":\"%04d-%02d-%02dT%02d:%02d:%02d\","
            "\"level\":\"%s\",\"event\":\"%s\"",
            tm->tm_year + 1900, tm->tm_mon + 1, tm->tm_mday,
            tm->tm_hour, tm->tm_min, tm->tm_sec,
            level_names[level], event);

    if (key1) fprintf(stderr, ",\"%s\":\"%s\"", key1, val1);
    if (key2) fprintf(stderr, ",\"%s\":\"%s\"", key2, val2);

    fprintf(stderr, "}\n");
}

// 使用示例
void handle_connection(int fd, const char* client_ip) {
    log_event(LOG_INFO, "connection_accepted",
              "fd", "5",
              "client", client_ip);

    // 处理连接...

    log_event(LOG_INFO, "connection_closed",
              "fd", "5",
              "bytes_transferred", "12345");
}
```

这样的日志可以直接用 `jq` 分析：

```bash
# 统计每秒接受的连接数
cat server.log | jq -r 'select(.event=="connection_accepted") | .time' | \
    cut -d'T' -f2 | cut -d':' -f1,2 | sort | uniq -c

# 查找处理时间超过 100ms 的请求
cat server.log | jq 'select(.event=="request_completed" and .duration_ms > 100)'
```

## 调试技巧

### 使用 gdb 调试运行中的进程

```bash
# 附加到进程（会暂停进程）
$ gdb -p 1234

# 查看当前调用栈
(gdb) bt
#0  epoll_wait () at ../sysdeps/unix/sysv/linux/epoll_wait.c:30
#1  event_loop (epfd=3) at server.c:156
#2  main (argc=1, argv=0x7ffc12345678) at server.c:203

# 查看局部变量
(gdb) frame 1
(gdb) print events
(gdb) print n

# 设置断点（会在下次调用时暂停）
(gdb) break handle_connection
(gdb) continue

# 单步执行
(gdb) next
(gdb) step

# 查看内存
(gdb) x/10x 0x12345678

# 退出（进程继续运行）
(gdb) detach
```

**生产环境注意**：gdb 会暂停目标进程，只在万不得已时使用。

### 使用 coredump 分析崩溃

如果进程崩溃了，coredump 是最好的"案发现场"：

```bash
# 确保启用 coredump
ulimit -c unlimited

# 崩溃后分析 core 文件
gdb ./server core.1234

# 查看崩溃时的调用栈
(gdb) bt
#0  0x00007f1234567890 in ?? ()
#1  handle_connection (fd=5) at server.c:89
#2  event_loop (epfd=3) at server.c:156

# 切换到具体的栈帧
(gdb) frame 1
(gdb) list
(gdb) print fd
(gdb) print buffer
```

## 最佳实践总结

### 监控的三个层次

1. **系统层面**：CPU、内存、网络、磁盘
2. **应用层面**：QPS、延迟、错误率、连接数
3. **业务层面**：订单量、成功率、用户行为

对于 epoll 应用，重点关注：
- 文件描述符数量
- `epoll_wait` 的调用频率和耗时
- 上下文切换次数
- 网络连接状态分布

### 调试的心法

1. **先观察，后假设**：不要一上来就改代码，先用工具确认问题
2. **二分法定位**：问题在哪个模块？哪个函数？哪一行？
3. **一次只改一个变量**：否则无法确定是哪个改动生效了
4. **留下痕迹**：记录你尝试了什么、结果是什么

### 工具选择指南

| 场景 | 推荐工具 |
|------|----------|
| 看进程状态 | /proc、ps、top |
| 追踪系统调用 | strace（开发）、perf（生产） |
| CPU 分析 | perf + 火焰图 |
| 内存分析 | valgrind（开发）、pprof（Go） |
| 网络分析 | ss、tcpdump、wireshark |
| 实时监控 | pidstat、iotop、iftop |
| 断点调试 | gdb |

## 总结

监控和调试是一门手艺，需要经验的积累。本章介绍的工具和方法是基础，但真正的能力来自于实践——遇到问题时的思考方式，对系统行为的直觉，以及快速定位问题的能力。

记住几个核心原则：

1. **数据说话**：用工具收集数据，而不是凭感觉
2. **从上到下**：先看宏观指标，再深入细节
3. **对比分析**：和正常时候比，和其他实例比
4. **保持好奇**：每个异常现象背后都有原因

下一章，我们将看看 epoll 在真实世界的应用——Nginx、Redis、Go runtime 是如何使用 epoll 的，从中学习工业级代码的设计智慧。
