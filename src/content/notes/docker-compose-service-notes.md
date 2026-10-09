---
title: Docker Compose 服务配置备忘
description: 集中保存 2023 年 ClickHouse、Kafka 与 Umami 的学习配置，列明配套文件和访问条件。
created: 2023-06-15 15:53:07
updated: 2026-10-05
tags:
  - Docker Compose
---

以下是 2023 年学习时留下的服务配置，不作为当前版本的完整搭建教程。配置集中保存，便于比对当时的环境。

| 服务       | 使用配置前需要补齐的条件                                                      |
| ---------- | ----------------------------------------------------------------------------- |
| ClickHouse | `deng` 外部网络，以及挂载的三个 XML 配置文件；原文未保存这些文件              |
| Kafka      | ZooKeeper 与 broker 的连接；advertised 地址为 127.0.0.1，仅对应本机客户端场景 |
| Umami      | 与当时镜像版本匹配的初始化 SQL；原文未保存 `schema.postgresql.sql`            |

镜像标签没有固定版本，不能据此保证今天能重现旧环境。未补齐上述材料之前，只把下列片段用作配置参考。

## DockerCompose搭建ClickHouse单机版

### 通过 Docker Compose 搭建 ClickHouse 单机版

#### docker-compose-single-clickhouse.yml

```yaml
version: "3"

services:
  clickhouse:
    image: yandex/clickhouse-server
    container_name: clickhouse
    restart: always
    networks:
      - deng
    ports:
      - "8123:8123"
      - "9000:9000"
    volumes:
      # 默认配置
      - ./data/config/docker_related_config.xml:/etc/clickhouse-server/config.d/docker_related_config.xml:rw
      - ./data/config/config.xml:/etc/clickhouse-server/config.xml:rw
      - ./data/config/users.xml:/etc/clickhouse-server/users.xml:rw
      - /etc/localtime:/etc/localtime:ro
      # 运行日志
      - ./data/log:/var/log/clickhouse-server
      # 数据持久
      - ./data:/var/lib/clickhouse:rw

networks:
  deng:
    external: true
```

## DockerCompose搭建Kafka单机版

### 通过 Docker Compose 搭建 Kafka 单机版

#### docker-compose-single-kafka.yml

```yaml
version: "2"
services:
  zookeeper:
    image: wurstmeister/zookeeper
    container_name: "zk-kafka"
    ports:
      - "2181:2181"
  kafka:
    image: wurstmeister/kafka
    container_name: "kafka-single"
    ports:
      - "9092:9092"
    environment:
      # client 要访问的 broker 地址
      KAFKA_ADVERTISED_HOST_NAME: 127.0.0.1
      # 通过端口连接 zookeeper
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      # 每个容器就是一个 broker,设置其对应的 ID
      KAFKA_BROKER_ID: 0
      # 外部网络只能获取到容器名称,在内外网络隔离情况下
      # 通过名称是无法成功访问 kafka 的
      # 因此需要通过绑定这个监听器能够让外部获取到的是 IP
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://127.0.0.1:9092
      # kafka 监听器,告诉外部连接者要通过什么协议访问指定主机名和端口开放的 Kafka 服务。
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092
      # Kafka默认使用-Xmx1G -Xms1G的JVM内存配置,由于服务器小,调整下启动配置
      # 这个看自己的现状做调整,如果资源充足,可以不用配置这个
      KAFKA_HEAP_OPTS: "-Xmx256M -Xms128M"
      # 设置 kafka 日志位置
      KAFKA_LOG_DIRS: "/kafka/logs"
```

#### `Docker Compose` 启动命令

```bash
docker-compose -f docker-compose-single-kafka.yml  up -d
```

## Docker搭建一个小而美的网站流量监控——Umami

### 通过 Docker搭建一个小而美的网站流量监控——Umami

#### 创建对应的目录

```bash
cd ~
mkdir -p ~/data/docker_data/umami
cd ~/data/docker_data/umami
```

#### 编写`docker-compose`配置文件

```bash
vim docker-compose.yml
```

```yaml
---
version: "3"
services:
  umami:
    image: ghcr.io/mikecao/umami:postgresql-latest
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://umami:umami@db:5432/umami # 这里的数据库和密码要和下方你修改的相同
      DATABASE_TYPE: postgresql
      HASH_SALT: replace-me-with-a-random-string
    depends_on:
      - db
    restart: always
  db:
    image: postgres:12-alpine
    environment:
      POSTGRES_DB: umami
      POSTGRES_USER: umami # 数据库用户
      POSTGRES_PASSWORD: umami # 数据库密码
    volumes:
      - ./sql/schema.postgresql.sql:/docker-entrypoint-initdb.d/schema.postgresql.sql:ro
      - ./umami-db-data:/var/lib/postgresql/data
    restart: always
```

#### 启动`Umami`

```bash
docker-compose up -d
```

此时,通过访问http://ip:3000就可以看到
