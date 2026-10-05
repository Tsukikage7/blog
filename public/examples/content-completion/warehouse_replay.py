"""Python 3.12 / SQLite，完整快照事件的可重放状态投影；不是 CDC 连接器。"""
import itertools
import json
import sqlite3
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Event:
    order_id: str
    version: int
    day: str | None
    cents: int | None
    deleted: bool = False


def database():
    db = sqlite3.connect(":memory:")
    db.executescript("""
      CREATE TABLE ledger(order_id TEXT, version INTEGER, payload TEXT NOT NULL,
                          PRIMARY KEY(order_id, version));
      CREATE TABLE current(order_id TEXT PRIMARY KEY, version INTEGER NOT NULL,
                           day TEXT, cents INTEGER, deleted INTEGER NOT NULL);
      CREATE TABLE summary(day TEXT PRIMARY KEY, cents INTEGER NOT NULL, n INTEGER NOT NULL);
      CREATE TABLE checkpoint(id INTEGER PRIMARY KEY CHECK(id=1), offset INTEGER NOT NULL);
      INSERT INTO checkpoint VALUES(1, 0);
    """)
    return db


def publish(db, events, start, end, fail=False):
    """start/end 是单一输入流的批次位置；version 是每个订单的源端版本。"""
    with db:
        actual = db.execute("SELECT offset FROM checkpoint WHERE id=1").fetchone()[0]
        if actual != start or end < start:
            raise ValueError("checkpoint conflict")
        for event in events:
            if event.version < 1 or (not event.deleted and
                                     (event.day is None or event.cents is None or event.cents < 0)):
                raise ValueError("invalid event")
            payload = json.dumps(asdict(event), sort_keys=True)
            old = db.execute("SELECT payload FROM ledger WHERE order_id=? AND version=?",
                             (event.order_id, event.version)).fetchone()
            if old and old[0] != payload:
                raise ValueError("same version has conflicting payloads")
            db.execute("INSERT OR IGNORE INTO ledger VALUES(?,?,?)",
                       (event.order_id, event.version, payload))
            db.execute("""INSERT INTO current VALUES(?,?,?,?,?)
              ON CONFLICT(order_id) DO UPDATE SET version=excluded.version,
              day=excluded.day, cents=excluded.cents, deleted=excluded.deleted
              WHERE excluded.version > current.version""",
                       (event.order_id, event.version, event.day, event.cents, event.deleted))
        # 小规模模型全量重算；生产增量发布必须同时修改旧分区与新分区。
        db.execute("DELETE FROM summary")
        db.execute("""INSERT INTO summary SELECT day, SUM(cents), COUNT(*)
                      FROM current WHERE deleted=0 GROUP BY day""")
        if fail:
            raise RuntimeError("fault between projection and checkpoint")
        db.execute("UPDATE checkpoint SET offset=? WHERE id=1", (end,))


def view(db):
    return db.execute("SELECT * FROM summary ORDER BY day").fetchall()


def main():
    events = [Event("A", 1, "2026-10-01", 100), Event("A", 2, "2026-10-02", 150),
              Event("B", 1, "2026-10-01", 200), Event("B", 2, None, None, True)]
    for order in itertools.permutations(events):
        db = database()
        publish(db, order, 0, 4)
        assert view(db) == [("2026-10-02", 150, 1)]
        publish(db, events, 4, 8)
        assert view(db) == [("2026-10-02", 150, 1)]
        assert db.execute("SELECT COUNT(*) FROM ledger").fetchone()[0] == 4
        db.close()
    db = database()
    try:
        publish(db, events, 0, 4, fail=True)
        raise AssertionError("fault not raised")
    except RuntimeError:
        assert view(db) == []
        assert db.execute("SELECT offset FROM checkpoint").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM ledger").fetchone()[0] == 0
    publish(db, events, 0, 4)
    try:
        publish(db, [Event("A", 2, "2026-10-02", 999)], 4, 5)
        raise AssertionError("conflict accepted")
    except ValueError:
        assert view(db) == [("2026-10-02", 150, 1)]
        assert db.execute("SELECT offset FROM checkpoint").fetchone()[0] == 4
    try:
        publish(db, [], 0, 4)
        raise AssertionError("stale batch accepted")
    except ValueError:
        pass
    db.close()
    print("24 permutations, replay, tombstone, day move, rollback, conflict, stale cursor: PASS")


if __name__ == "__main__":
    main()
