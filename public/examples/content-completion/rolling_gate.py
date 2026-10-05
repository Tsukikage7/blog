"""只运行确定性的模拟适配器，不连接真实集群。"""
from dataclasses import dataclass
from uuid import uuid4


@dataclass(frozen=True)
class Health:
    process: bool
    service: bool
    membership: bool

    @property
    def ready(self):
        return self.process and self.service and self.membership


def roll(hosts, adapter, emit, batch_size=1, max_unavailable=1):
    if not hosts or len(set(hosts)) != len(hosts):
        raise ValueError("host list must be non-empty and unique")
    if not 1 <= batch_size <= max_unavailable:
        raise ValueError("batch exceeds availability budget")
    operation = str(uuid4())
    for offset in range(0, len(hosts), batch_size):
        batch = hosts[offset:offset + batch_size]
        # 批次开始前检查整个集群，既有故障也消耗不可用预算。
        unhealthy = sum(not adapter.health(host).ready for host in hosts)
        if unhealthy + len(batch) > max_unavailable:
            emit(operation, "blocked", batch)
            return False
        for host in batch:
            for step in ("drain", "restart", "wait_ready", "resume"):
                try:
                    ok = adapter.step(host, step, operation, timeout_seconds=30)
                except (TimeoutError, OSError):
                    ok = False
                emit(operation, step + (":ok" if ok else ":failed"), host)
                if not ok:
                    return False
            if not adapter.health(host).ready:
                emit(operation, "postcheck:failed", host)
                return False
    return True


class Fake:
    def __init__(self, fail=None, bad=None):
        self.fail, self.bad, self.calls = fail, bad, []

    def health(self, host):
        return Health(True, True, host != self.bad)

    def step(self, host, step, operation, timeout_seconds):
        self.calls.append((host, step))
        if (host, step) == self.fail:
            raise TimeoutError("injected timeout")
        return True


if __name__ == "__main__":
    events = []
    emit = lambda *event: events.append(event)
    happy = Fake()
    assert roll(["a", "b", "c"], happy, emit)
    assert len(happy.calls) == 12 and len({e[0] for e in events}) == 1
    failed = Fake(fail=("b", "wait_ready"))
    assert not roll(["a", "b", "c"], failed, emit)
    assert not any(host == "c" for host, _ in failed.calls)
    assert ("b", "resume") not in failed.calls
    degraded = Fake(bad="c")
    assert not roll(["a", "b", "c"], degraded, emit) and not degraded.calls
    try:
        roll(["a", "b"], Fake(), emit, batch_size=2, max_unavailable=1)
        raise AssertionError("unsafe budget accepted")
    except ValueError:
        pass
    print("rolling order, timeout stops next host, preexisting failure, availability budget: PASS")
