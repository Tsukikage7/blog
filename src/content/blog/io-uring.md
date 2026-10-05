---
title: "io_uring：提交、完成与缓冲区生命周期"
description: "区分就绪通知和完成通知，用一次文件读取说明 SQE、CQE、错误处理与缓冲区复用边界。"
created: 2026-01-13 00:00:00
updated: 2026-10-05
categories:
  - Linux 与网络
tags:
  - Linux
  - I/O
  - io_uring
image: "https://assets.tsukikage7.com/blog/cover/io-uring.webp"
---

epoll 通知文件描述符的就绪状态，程序随后执行实际读写；io_uring 允许提交一个操作，再从完成队列读取它的结果。理解这个区别，才能判断事件循环需要怎样管理请求与内存。

这里使用普通 liburing 读取请求，先把请求的生命周期走完整，再讨论轮询、注册缓冲区和优化。本文不提供“比 epoll 快几倍”的结论。

## SQE 描述请求，CQE 描述完成

Submission Queue 保存待提交操作，Completion Queue 保存完成结果。程序获得一个 SQE 后填写操作、文件描述符、缓冲区和偏移；提交后，用 CQE 的 `user_data` 关联原请求，用 `res` 判断结果。[io_uring 概览](https://man7.org/linux/man-pages/man7/io_uring.7.html)描述了两组队列。

共享队列通常通过 mmap 映射，但共享控制结构不等于用户数据零拷贝，也不意味着不再需要系统调用。默认路径仍可能需要进入内核提交或等待，liburing 负责具体接口细节。

## 生命周期比队列名称更重要

| 阶段       | 程序需要保证                                 |
| ---------- | -------------------------------------------- |
| 填写 SQE   | 还有队列槽位，参数合法，关联标识明确         |
| 提交后等待 | 请求缓冲区保持有效，不能修改或复用           |
| 读取 CQE   | 区分等待接口错误与实际操作错误               |
| 处理结果   | 处理 EOF、短读或短写；保存后续还需使用的字段 |
| 标记已消费 | 不再访问该 CQE；业务缓冲区按请求生命周期回收 |

`io_uring_submit` 的返回值表示提交数量，不是读取的字节数。[submit 文档](https://man7.org/linux/man-pages/man3/io_uring_submit.3.html)与 [wait_cqe 文档](https://man7.org/linux/man-pages/man3/io_uring_wait_cqe.3.html)解释了各自的返回值。

普通读取完成时，`cqe->res < 0` 表示负的错误码，0 表示 EOF，正数是本次读取字节数。[prep_read 文档](https://man7.org/linux/man-pages/man3/io_uring_prep_read.3.html)说明了读取参数和完成结果。不要在操作失败时直接查看 `errno` 来替代 `-cqe->res`。

## 一个读取一次的完整程序

下面从文件偏移 0 读取最多 4,096 字节，并写到标准输出。只提交一个请求，不使用 SQPOLL、固定缓冲区、链接请求或 multishot，因此完成处理边界清晰。它不是完整文件复制工具，也不是 echo 服务器。

```c
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <liburing.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>

int main(int argc, char **argv) {
    if (argc != 2) {
        fprintf(stderr, "usage: %s FILE\n", argv[0]);
        return 2;
    }
    int fd = open(argv[1], O_RDONLY);
    if (fd < 0) { perror("open"); return 1; }
    struct io_uring ring;
    int rc = io_uring_queue_init(2, &ring, 0);
    if (rc < 0) {
        fprintf(stderr, "queue_init: %s\n", strerror(-rc));
        close(fd);
        return 1;
    }
    char buffer[4096];
    struct io_uring_sqe *sqe = io_uring_get_sqe(&ring);
    if (!sqe) { fprintf(stderr, "SQ full\n"); rc = -ENOSPC; goto done; }
    io_uring_prep_read(sqe, fd, buffer, sizeof buffer, 0);
    io_uring_sqe_set_data64(sqe, 1);
    rc = io_uring_submit(&ring);
    if (rc != 1) {
        fprintf(stderr, "submit: %s\n", rc < 0 ? strerror(-rc) : "no request submitted");
        rc = -EIO;
        goto done;
    }
    struct io_uring_cqe *cqe;
    do { rc = io_uring_wait_cqe(&ring, &cqe); } while (rc == -EINTR);
    if (rc < 0) { fprintf(stderr, "wait: %s\n", strerror(-rc)); goto done; }
    int result = cqe->res;
    unsigned long long id = (unsigned long long) cqe->user_data;
    io_uring_cqe_seen(&ring, cqe);
    if (id != 1) { fprintf(stderr, "unexpected request id\n"); rc = -EIO; goto done; }
    if (result < 0) { fprintf(stderr, "read: %s\n", strerror(-result)); rc = result; goto done; }
    if (fwrite(buffer, 1, (size_t) result, stdout) != (size_t) result) {
        perror("fwrite"); rc = -EIO;
    } else rc = 0;
done:
    io_uring_queue_exit(&ring);
    close(fd);
    return rc < 0 ? 1 : 0;
}
```

在安装 liburing 开发库的 Linux 环境执行：

```sh
cc -std=c11 -Wall -Wextra -Werror "read_once.c" -luring -o "read_once"
printf 'hello io_uring\n' > "input.txt"
./read_once "input.txt"
```

[下载完整程序](/examples/content-completion/read_once.c)。正常成功路径先保存完成结果，再调用 `io_uring_cqe_seen`，最后关闭 ring 和文件。CQE 槽位标记消费后可能复用，因此不能继续从旧指针读取。[cqe_seen 文档](https://man7.org/linux/man-pages/man3/io_uring_cqe_seen.3.html)解释了这个接口。

这份单请求程序的栈缓冲区一直保留到清理结束。扩展成并发服务器时，需要用请求对象管理内存，在请求真正完成前保持它有效；取消请求也必须等待并处理相关完成事件，不能收到取消请求的结果就任意释放原请求缓冲区。

## 固定缓冲区不自动消除数据拷贝

注册缓冲区使内核预先获得可用内存范围，可减少特定路径的反复注册、映射等成本。它不是对所有文件和网络读写的零拷贝承诺。[缓冲区注册文档](https://man7.org/linux/man-pages/man3/io_uring_register_buffers.3.html)说明了注册范围与使用方式。

特定发送操作支持零拷贝相关机制时，还要遵守它的额外完成与内存复用约束，不能直接套用普通单次读取的“一条 CQE 即可回收所有资源”。

## SQPOLL 与 IOPOLL 解决不同问题

SQPOLL 让内核线程轮询提交队列，减少部分提交路径的进入内核成本；线程休眠后可能仍需要唤醒。IOPOLL 用轮询方式检查适用设备的 I/O 完成，受设备、驱动与请求方式限制。二者都不是“免费加速”，也不能视为三个互斥工作模式。[setup 文档](https://man7.org/linux/man-pages/man2/io_uring_setup.2.html)列出配置条件。

先测默认模式，再讨论轮询。请求深度太大可能增加延迟和内存，轮询还会占 CPU。比较 epoll 与 io_uring 时要保持负载、缓冲区、并发、错误处理和机器条件相同，记录吞吐、尾延迟及 CPU，不能用系统调用的估算时间直接推导性能收益。

## 运行失败与验证范围

本次整理在 Linux/arm64 的 Alpine 容器中使用上述编译选项通过编译；运行时初始化返回 `Operation not permitted`。因此当前验证没有覆盖成功读取、EOF 或短读路径。应在允许该接口的 Linux 环境继续复现以下用例，不能把这次编译结果作为读取成功的证据。

内核版本和功能支持、容器策略或系统配置可能使初始化返回错误。先保留实际错误码，再检查运行环境，不能把初始化失败当作程序已经验证成功。这个示例不依赖某个未经探测的新 opcode；更复杂的程序应检查实际支持的功能。

复现时至少覆盖普通小文件、空文件、不存在路径以及超过缓冲区的文件；最后一种预期只输出前 4,096 字节。本文没有提供网络服务器实测或性能排名。理解就绪通知可对照 [epoll EP1](/blog/epoll-ep1/)。

[下载全部示例工程](/examples/content-completion/content-examples.zip)。
