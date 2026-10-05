package pool

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
)

func TestBoundAndCompletion(t *testing.T) {
	var active, peak, completed atomic.Int64
	items := make([]int, 10000)
	err := Run(t.Context(), 4, 8, items, func(context.Context, int) error {
		n := active.Add(1)
		for old := peak.Load(); n > old && !peak.CompareAndSwap(old, n); old = peak.Load() {
		}
		completed.Add(1)
		active.Add(-1)
		return nil
	})
	if err != nil || peak.Load() > 4 || completed.Load() != int64(len(items)) {
		t.Fatalf("err=%v peak=%d completed=%d", err, peak.Load(), completed.Load())
	}
}

func TestFailureCancelsAndJoins(t *testing.T) {
	want := errors.New("upstream failed")
	var finished atomic.Int64
	items := make([]int, 10000)
	items[0] = 1
	err := Run(t.Context(), 4, 8, items, func(ctx context.Context, value int) error {
		defer finished.Add(1)
		if value == 1 {
			return want
		}
		<-ctx.Done()
		return context.Cause(ctx)
	})
	if !errors.Is(err, want) || finished.Load() > 4 || finished.Load() < 1 {
		t.Fatalf("err=%v finished=%d", err, finished.Load())
	}
}

func TestAlreadyCancelledAndInvalid(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	var executed atomic.Int64
	err := Run(ctx, 2, 2, []int{1, 2, 3}, func(context.Context, int) error {
		executed.Add(1)
		return nil
	})
	if !errors.Is(err, context.Canceled) || executed.Load() != 0 {
		t.Fatalf("err=%v executed=%d", err, executed.Load())
	}
	if Run(t.Context(), 0, 0, []int{}, func(context.Context, int) error { return nil }) == nil {
		t.Fatal("invalid worker count accepted")
	}
}
