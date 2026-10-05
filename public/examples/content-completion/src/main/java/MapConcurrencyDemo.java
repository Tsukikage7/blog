import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;

public final class MapConcurrencyDemo {
    // 只合并正在进行的加载；完成后移除，不承担缓存的过期和容量策略。
    static final class SingleFlight<K, V> {
        private final ConcurrentHashMap<K, CompletableFuture<V>> flights = new ConcurrentHashMap<>();
        private final Executor executor;
        SingleFlight(Executor executor) { this.executor = executor; }
        CompletableFuture<V> load(K key, Supplier<V> loader) {
            CompletableFuture<V> mine = new CompletableFuture<>();
            CompletableFuture<V> existing = flights.putIfAbsent(key, mine);
            if (existing != null) return existing.thenApply(value -> value);
            try {
                executor.execute(() -> {
                    try { mine.complete(loader.get()); }
                    catch (Throwable error) { mine.completeExceptionally(error); }
                    finally { flights.remove(key, mine); }
                });
            } catch (RuntimeException error) {
                flights.remove(key, mine);
                mine.completeExceptionally(error);
            }
            // 调用者取消这个依赖 Future 不会取消大家共享的 mine。
            return mine.thenApply(value -> value);
        }
    }
    static final class MutableKey {
        int id;
        MutableKey(int id) { this.id = id; }
        public int hashCode() { return id; }
        public boolean equals(Object other) { return other instanceof MutableKey k && id == k.id; }
    }
    static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
    public static void main(String[] args) throws Exception {
        var key = new MutableKey(1);
        var map = new HashMap<MutableKey, String>();
        map.put(key, "value"); key.id = 2;
        check(map.get(key) == null && map.size() == 1, "mutable key counterexample");

        var counts = new ConcurrentHashMap<String, Integer>(); counts.put("k", 0);
        var read = new CyclicBarrier(2);
        Runnable lost = () -> {
            int old = counts.get("k");
            try { read.await(5, TimeUnit.SECONDS); } catch (Exception error) { throw new RuntimeException(error); }
            counts.put("k", old + 1);
        };
        var threads = Executors.newFixedThreadPool(2);
        try {
            var a = threads.submit(lost); var b = threads.submit(lost);
            a.get(5, TimeUnit.SECONDS); b.get(5, TimeUnit.SECONDS);
            check(counts.get("k") == 1, "compound lost update");
            counts.put("k", 0);
            a = threads.submit(() -> { for (int i = 0; i < 2000; i++) counts.merge("k", 1, Integer::sum); });
            b = threads.submit(() -> { for (int i = 0; i < 2000; i++) counts.merge("k", 1, Integer::sum); });
            a.get(5, TimeUnit.SECONDS); b.get(5, TimeUnit.SECONDS);
            check(counts.get("k") == 4000, "atomic merge");
        } finally { threads.shutdownNow(); }

        var queue = new ArrayDeque<Runnable>();
        var flight = new SingleFlight<String, Integer>(queue::add);
        var loads = new AtomicInteger();
        Supplier<Integer> loader = () -> loads.incrementAndGet();
        var a = flight.load("k", loader); var b = flight.load("k", loader);
        a.cancel(false); queue.remove().run();
        check(b.join() == 1 && loads.get() == 1, "shared load/caller cancellation");
        var failed = flight.load("k", () -> { throw new IllegalStateException("upstream"); });
        queue.remove().run();
        check(failed.isCompletedExceptionally(), "failed future");
        var retry = flight.load("k", loader); queue.remove().run();
        check(retry.join() == 2, "retry after failure");
        var rejected = new SingleFlight<String, Integer>(task -> { throw new RejectedExecutionException(); });
        check(rejected.load("k", loader).isCompletedExceptionally(), "executor rejection");
        check(rejected.flights.isEmpty(), "rejected load leaked entry");
        System.out.println("mutable key, lost update, merge, single-flight, cancellation, failure/retry, rejection: PASS");
    }
}
