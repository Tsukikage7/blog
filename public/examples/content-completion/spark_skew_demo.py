"""Spark 3.5.7 local[2]：验证热 key 拆分与二阶段聚合，不声称生产性能提升。"""
from operator import add
from statistics import median
from pyspark.sql import SparkSession


def combine(a, b):
    return a[0] + b[0], a[1] + b[1]


def stats(rdd):
    sizes = rdd.mapPartitions(lambda rows: [sum(1 for _ in rows)]).collect()
    return {"sizes": sizes, "max": max(sizes), "median": median(sizes)}


spark = SparkSession.builder.appName("skew-correctness").getOrCreate()
sc = spark.sparkContext
sc.setLogLevel("ERROR")
try:
    p, salts = 8, 8
    # (稳定 event_id, 业务 key, 整数金额)。用整数避免浮点求和顺序影响比较。
    rows = sc.parallelize(range(100000), p).map(
        lambda i: (i, "hot" if i < 90000 else "k" + str(i % 100), i % 97))
    keyed = rows.map(lambda x: (x[1], x[2]))
    baseline = dict(keyed.mapValues(lambda x: (x, 1)).reduceByKey(combine, p).collect())
    salted = rows.map(lambda x: ((x[1], x[0] % salts if x[1] == "hot" else 0), (x[2], 1)))
    stage_one = salted.reduceByKey(combine, p)
    final = stage_one.map(lambda x: (x[0][0], x[1])).reduceByKey(combine, p)
    result = dict(final.collect())
    assert result == baseline and result["hot"][1] == 90000
    # 对照是“记录按 key 重分区”的行数；reduceByKey 有 map-side combine，
    # 因此这些行数绝不是实际 Shuffle 字节数，也不能推导加速倍数。
    before = stats(keyed.partitionBy(p))
    after = stats(salted.partitionBy(p))
    print("raw key partition rows:", before)
    print("salted key partition rows:", after)
    print("partial aggregate rows:", stage_one.count())
    print("hot weighted average:", result["hot"][0] / result["hot"][1])
    assert after["max"] < before["max"]
    # 平均数不能直接平均：分组大小不一致的最小反例。
    assert (10 + 100) / 2 != (10 * 1 + 100 * 9) / 10
    print("same sum/count, skew row distribution, invalid average counterexample: PASS")
finally:
    spark.stop()
