package lifecycle

import (
	"errors"
	"fmt"
	"io"
	"sync"
)

type App struct {
	Store io.Closer
	Cache io.Closer
}

// Build 是依赖图的装配入口，open 返回成功资源的所有权。
func Build(open func(string) (io.Closer, error), validate func(*App) error) (*App, func() error, error) {
	var resources []io.Closer
	var closeErr error
	var once sync.Once
	cleanup := func() error {
		once.Do(func() {
			for i := len(resources) - 1; i >= 0; i-- {
				closeErr = errors.Join(closeErr, resources[i].Close())
			}
		})
		return closeErr
	}
	store, err := open("store")
	if err != nil {
		return nil, nil, fmt.Errorf("open store: %w", err)
	}
	resources = append(resources, store)
	cache, err := open("cache")
	if err != nil {
		return nil, nil, errors.Join(fmt.Errorf("open cache: %w", err), cleanup())
	}
	resources = append(resources, cache)
	app := &App{Store: store, Cache: cache}
	if err := validate(app); err != nil {
		return nil, nil, errors.Join(fmt.Errorf("validate service: %w", err), cleanup())
	}
	return app, cleanup, nil
}
