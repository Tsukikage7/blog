import org.apache.pekko.actor.typed.{ActorRef, Behavior}
import org.apache.pekko.actor.typed.scaladsl.Behaviors
import org.apache.pekko.actor.testkit.typed.scaladsl.ActorTestKit
import scala.concurrent.{Future, Promise}
import scala.util.{Try, Success, Failure}

object AsyncState {
  sealed trait Command
  final case class Refresh(id: String, replyTo: ActorRef[Event]) extends Command
  final case class Inspect(replyTo: ActorRef[Option[String]]) extends Command
  private final case class Completed(epoch: Long, result: Try[String], replyTo: ActorRef[Event]) extends Command
  sealed trait Event
  final case class Accepted(epoch: Long) extends Event
  case object Busy extends Event
  final case class Finished(epoch: Long, applied: Boolean, failed: Boolean) extends Event

  def apply(limit: Int, load: String => Future[String]): Behavior[Command] = {
    require(limit > 0)
    Behaviors.setup { context =>
      def loop(epoch: Long, value: Option[String], pending: Set[Long]): Behavior[Command] =
        Behaviors.receiveMessage {
          case Refresh(_, replyTo) if pending.size >= limit =>
            replyTo ! Busy
            Behaviors.same
          case Refresh(id, replyTo) =>
            val next = epoch + 1
            val future = Try(load(id)).fold(Future.failed, identity)
            context.pipeToSelf(future)(result => Completed(next, result, replyTo))
            replyTo ! Accepted(next)
            loop(next, value, pending + next)
          case Completed(done, result, replyTo) =>
            val applied = done == epoch && pending.contains(done) && result.isSuccess
            val nextValue = if (applied) result.toOption else value
            replyTo ! Finished(done, applied, result.isFailure)
            loop(epoch, nextValue, pending - done)
          case Inspect(replyTo) =>
            replyTo ! value
            Behaviors.same
        }
      loop(0L, None, Set.empty)
    }
  }
}

object AsyncStateDemo extends App {
  import AsyncState._
  val kit = ActorTestKit()
  val first, second, third = Promise[String]()
  val futures = Map("first" -> first.future, "second" -> second.future, "third" -> third.future)
  try {
    val actor = kit.spawn(AsyncState(2, futures.apply))
    val events = kit.createTestProbe[Event]()
    val view = kit.createTestProbe[Option[String]]()
    actor ! Refresh("first", events.ref); events.expectMessage(Accepted(1))
    actor ! Refresh("second", events.ref); events.expectMessage(Accepted(2))
    actor ! Refresh("third", events.ref); events.expectMessage(Busy)
    second.success("new"); events.expectMessage(Finished(2, true, false))
    first.success("old"); events.expectMessage(Finished(1, false, false))
    actor ! Inspect(view.ref); view.expectMessage(Some("new"))
    actor ! Refresh("third", events.ref); events.expectMessage(Accepted(3))
    third.failure(new IllegalStateException("unavailable"))
    events.expectMessage(Finished(3, false, true))
    actor ! Inspect(view.ref); view.expectMessage(Some("new"))
    actor ! Refresh("unknown", events.ref); events.expectMessage(Accepted(4))
    events.expectMessage(Finished(4, false, true))
    println("out-of-order completion, capacity, failed refresh, synchronous exception: PASS")
  } finally kit.shutdownTestKit()
}
