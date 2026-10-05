package lifecycle

import (
	"errors"
	"io"
	"reflect"
	"testing"
)

type resource struct {
	name string
	log  *[]string
	err  error
}

func (r resource) Close() error {
	*r.log = append(*r.log, r.name)
	return r.err
}

func TestRollbackAndErrorIdentity(t *testing.T) {
	startup := errors.New("invalid schema")
	closing := errors.New("close failed")
	var log []string
	_, _, err := Build(func(name string) (io.Closer, error) {
		return resource{name, &log, closing}, nil
	}, func(*App) error { return startup })
	if !errors.Is(err, startup) || !errors.Is(err, closing) || !reflect.DeepEqual(log, []string{"cache", "store"}) {
		t.Fatalf("err=%v log=%v", err, log)
	}
}

func TestPartialFailureAndCleanupOnce(t *testing.T) {
	var log []string
	_, _, err := Build(func(name string) (io.Closer, error) {
		if name == "cache" {
			return nil, errors.New("cache unavailable")
		}
		return resource{name, &log, nil}, nil
	}, func(*App) error { return nil })
	if err == nil || !reflect.DeepEqual(log, []string{"store"}) {
		t.Fatalf("err=%v log=%v", err, log)
	}
	log = nil
	_, cleanup, err := Build(func(name string) (io.Closer, error) {
		return resource{name, &log, nil}, nil
	}, func(*App) error { return nil })
	if err != nil {
		t.Fatal(err)
	}
	if err := cleanup(); err != nil {
		t.Fatal(err)
	}
	if err := cleanup(); err != nil || !reflect.DeepEqual(log, []string{"cache", "store"}) {
		t.Fatalf("err=%v log=%v", err, log)
	}
}
