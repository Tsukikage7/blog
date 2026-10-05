# 工程文章独立示例

下载 content-examples.zip 解压到独立目录。依赖与博客应用分离；不要在博客 public 目录内编译，避免构建产物进入静态站点。

## Go：准入与资源生命周期

目标 Go 1.24 或以上，使用标准库，无外部模块依赖。

```sh
cd "go"
go test -race -count=5 ./...
```

pool 检查执行上限、首个错误取消与等待、预先取消与非法配置；lifecycle 检查部分构造失败、逆序回收、错误身份与幂等清理。任务必须响应 context；此模型不提供入口的全局准入。

## Java 与 Pekko Typed

Java 17 或以上、Maven；Scala 2.13.16、Pekko 1.1.3 固定在 pom.xml。Map 示例可以单独运行：

```sh
java "src/main/java/MapConcurrencyDemo.java"
```

编译并运行三个例子：

```sh
mvn -f "pom.xml" compile dependency:build-classpath -Dmdep.outputFile="classpath.txt"
task_example_cp="target/classes:$(cat "classpath.txt")"
java -cp "$task_example_cp" MapConcurrencyDemo
java -cp "$task_example_cp" AsyncStateDemo
java -cp "$task_example_cp" LeaseFencingDemo
```

Map 检查可变 key、复合更新、共享加载、等待者取消和失败重试。AsyncState 用 Promise 控制乱序并验证在途容量。LeaseFencing 特意保留“租约过期但没有新 fence 时旧写入仍被接受”的反例，随后验证新代次拒绝旧写入。全部是单进程实验，不提供网络身份认证、持久化或分布式一致性验证。

## 增量发布与滚动操作

Python 3.12 或以上，标准库。

```sh
python3 "warehouse_replay.py"
python3 "rolling_gate.py"
```

SQLite 模型验证完整状态事件的版本投影、tombstone、跨日修正、重放与故障回滚；未连接真实 CDC 来源。滚动模型只调用模拟适配器，不执行远程命令，验证既有故障预算与失败停止。

## Spark 倾斜与聚合正确性

Spark/PySpark 3.5.7，本地模式：

```sh
spark-submit --master 'local[2]' "spark_skew_demo.py"
```

或在解压目录运行固定版本容器：

```sh
docker run --rm --network none --hostname spark-local \
  --add-host spark-local:127.0.0.1 -e SPARK_LOCAL_IP=127.0.0.1 \
  -v "$PWD:/examples:ro" apache/spark:3.5.7 \
  /opt/spark/bin/spark-submit --master 'local[2]' \
  --conf spark.ui.enabled=false "/examples/spark_skew_demo.py"
```

100000 条输入中 hot 占 90000；8 分区下原始分区最大 91400 行，加盐后最大 12950 行，完整 sum/count 与基线一致。这些是原始记录分区分布，不是 reduceByKey 的实际 Shuffle 字节，也不是生产性能基准。

## io_uring

需要支持 io_uring 的 Linux、C 编译器、Linux 头文件与 liburing 开发库。macOS 不能原生运行。

```sh
cc -std=c11 -Wall -Wextra -Werror "read_once.c" -luring -o "read_once"
printf 'hello io_uring\n' > "input.txt"
./read_once "input.txt"
```

程序只读取偏移 0 开始的最多 4096 字节。空文件无输出，不存在路径返回非零。2026-10-05 的 Linux/arm64 Alpine 容器中编译通过，初始化返回 Operation not permitted；成功读取、EOF 与短读路径未验证，不更改容器限制来绕过。

Java、Scala、Go、Python 与 Spark 工程示例已在本机或独立本地容器运行通过。Dubbo 文章核对上游 PR，未附未验证的双端成功示例。
