import org.apache.pekko.actor.typed.{ActorRef, Behavior}
import org.apache.pekko.actor.typed.scaladsl.Behaviors
import org.apache.pekko.actor.testkit.typed.scaladsl.ActorTestKit
import java.util.concurrent.atomic.AtomicLong

// 单进程模型：advance 与 write 使用同一锁；真实系统必须在目标存储原子执行。
final class FencedSink {
  private var fence = 0L
  private var results = Map.empty[String, String]
  def advance(): Long = synchronized { fence += 1; fence }
  def write(token: Long, resultId: String, payload: String): Boolean = synchronized {
    if (token != fence) false
    else results.get(resultId) match {
      case Some(old) => old == payload
      case None => results += resultId -> payload; true
    }
  }
  def snapshot: Map[String, String] = synchronized { results }
}

object LeaseRegistry {
  sealed trait Command
  final case class Acquire(owner: String, replyTo: ActorRef[Option[Long]]) extends Command
  final case class Renew(owner: String, token: Long, replyTo: ActorRef[Boolean]) extends Command
  final case class Lease(owner: String, token: Long, until: Long)

  def apply(ttl: Long, now: () => Long, sink: FencedSink): Behavior[Command] = {
    require(ttl > 0)
    def loop(lease: Option[Lease]): Behavior[Command] = Behaviors.receiveMessage {
      case Acquire(owner, replyTo) =>
        val time = now()
        if (owner.isEmpty || lease.exists(_.until > time)) {
          replyTo ! None
          Behaviors.same
        } else {
          // 在向新持有者返回 token 前，先在写入目标推进 fence。
          val token = sink.advance()
          replyTo ! Some(token)
          loop(Some(Lease(owner, token, time + ttl)))
        }
      case Renew(owner, token, replyTo) =>
        val time = now()
        lease match {
          case Some(old) if old.owner == owner && old.token == token && old.until > time =>
            replyTo ! true
            loop(Some(old.copy(until = time + ttl)))
          case _ => replyTo ! false; Behaviors.same
        }
    }
    loop(None)
  }
}

object LeaseFencingDemo extends App {
  import LeaseRegistry._
  val kit = ActorTestKit()
  val time = new AtomicLong(0L)
  val sink = new FencedSink
  try {
    val registry = kit.spawn(LeaseRegistry(5L, () => time.get(), sink))
    val grant = kit.createTestProbe[Option[Long]]()
    val ack = kit.createTestProbe[Boolean]()
    registry ! Acquire("old-incarnation", grant.ref)
    val old = grant.receiveMessage().get
    assert(sink.write(old, "before", "a"))
    time.set(5L)
    registry ! Renew("old-incarnation", old, ack.ref); ack.expectMessage(false)
    // TTL 到期并未自动改变写入目标的 fence，这是有意保留的反例。
    assert(sink.write(old, "expired-but-no-successor", "b"))
    registry ! Acquire("new-incarnation", grant.ref)
    val current = grant.receiveMessage().get
    assert(current > old)
    assert(!sink.write(old, "late", "stale"))
    assert(sink.write(current, "result", "new"))
    assert(sink.write(current, "result", "new"))
    assert(!sink.write(current, "result", "conflict"))
    assert(!sink.snapshot.contains("late"))
    kit.stop(registry)
    // Registry 重启不重置写入目标；不把它称为持久化验证。
    val restarted = kit.spawn(LeaseRegistry(5L, () => time.get(), sink))
    restarted ! Acquire("third-incarnation", grant.ref)
    val afterRestart = grant.receiveMessage().get
    assert(afterRestart > current && !sink.write(current, "after-restart", "stale"))
    println("lease expiry counterexample, sink fencing, duplicate/conflict, registry restart: PASS")
  } finally kit.shutdownTestKit()
}
