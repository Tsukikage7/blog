package pool

import (
	"context"
	"errors"
	"sync"
)

// Run 的队列与执行者有界；fn 必须响应 ctx，否则取消后仍会等待它退出。
func Run[T any](parent context.Context, workers, capacity int, items []T, fn func(context.Context, T) error) error {
	if workers < 1 || capacity < 0 || fn == nil {
		return errors.New("invalid pool configuration")
	}
	ctx, cancel := context.WithCancelCause(parent)
	defer cancel(nil)
	jobs := make(chan T, capacity)
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for item := range jobs {
				if ctx.Err() != nil {
					return
				}
				if err := fn(ctx, item); err != nil {
					cancel(err)
					return
				}
			}
		}()
	}
submit:
	for _, item := range items {
		select {
		case <-ctx.Done():
			break submit
		case jobs <- item:
		}
	}
	close(jobs)
	wg.Wait()
	return context.Cause(ctx)
}
