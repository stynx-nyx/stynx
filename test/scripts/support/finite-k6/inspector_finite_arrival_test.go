// Inspector native sensor; copied only into the hash-verified diagnostic source.
// The real Run loop, real VU pool, drops, allocation and cleanup execute here.
package executor

import (
	"context"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"go.k6.io/k6/lib"
	"go.k6.io/k6/lib/types"
	"go.k6.io/k6/metrics"
	"gopkg.in/guregu/null.v3"
)

type inspectorReset struct{ delay, elapsed time.Duration }
type inspectorTimer struct{ C chan time.Time }
type inspectorClock struct {
	epoch                        time.Time
	nanos                        int64
	resets                       chan inspectorReset
	timer                        *inspectorTimer
	mutex                        sync.Mutex
	cancelRegular, cancelMaximum context.CancelFunc
	duration, grace              time.Duration
}

var inspectorNativeClock *inspectorClock

func inspectorFiniteSince(time.Time) time.Duration {
	return time.Duration(atomic.LoadInt64(&inspectorNativeClock.nanos))
}
func inspectorFiniteNow() time.Time {
	return inspectorNativeClock.epoch.Add(inspectorFiniteSince(time.Time{}))
}
func inspectorFiniteNewTimer(duration time.Duration) *inspectorTimer {
	if duration != 24*time.Hour {
		panic("unexpected original native timer constructor")
	}
	c := inspectorNativeClock
	c.timer = &inspectorTimer{C: make(chan time.Time, 1)}
	return c.timer
}
func (t *inspectorTimer) Reset(delay time.Duration) bool {
	inspectorNativeClock.resets <- inspectorReset{delay, inspectorFiniteSince(time.Time{})}
	return false
}
func inspectorFiniteDurationContexts(parent context.Context, duration, grace time.Duration) (time.Time, context.Context, context.Context, func()) {
	c := inspectorNativeClock
	max, maxCancel := context.WithCancel(parent)
	regular, regularCancel := context.WithCancel(max)
	c.mutex.Lock()
	c.cancelRegular = regularCancel
	c.cancelMaximum = maxCancel
	c.duration = duration
	c.grace = grace
	c.mutex.Unlock()
	return c.epoch, max, regular, func() { regularCancel(); maxCancel() }
}
func (c *inspectorClock) cancel() {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	if c.cancelRegular != nil {
		c.cancelRegular()
	}
	if c.cancelMaximum != nil {
		c.cancelMaximum()
	}
}
func (c *inspectorClock) advance(d time.Duration) {
	if d > inspectorFiniteSince(time.Time{}) {
		atomic.StoreInt64(&c.nanos, int64(d))
	}
}
func inspectorWait(t *testing.T, predicate func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for !predicate() {
		if time.Now().After(deadline) {
			t.Fatal("actual native VU synchronization deadline")
		}
		runtime.Gosched()
	}
}

type inspectorResult struct {
	timers        []time.Duration
	calls         int64
	drops         float64
	initialized   int64
	full, partial uint64
	actualStarts  []time.Duration
}

func inspectorRun(t *testing.T, kind string) inspectorResult {
	t.Helper()
	c := &inspectorClock{epoch: time.Now(), resets: make(chan inspectorReset, 1)}
	inspectorNativeClock = c
	if kind == "delayed-start" {
		atomic.StoreInt64(&c.nanos, int64(3*time.Second))
	}
	var count int64
	var startsMutex sync.Mutex
	var starts []time.Duration
	runner := simpleRunner(func(ctx context.Context, _ *lib.State) error {
		startsMutex.Lock()
		starts = append(starts, inspectorFiniteSince(time.Time{}))
		startsMutex.Unlock()
		atomic.AddInt64(&count, 1)
		if kind == "unavailable-max-vu" {
			<-ctx.Done()
		}
		return nil
	})
	config := &ConstantArrivalRateConfig{BaseConfig: BaseConfig{GracefulStop: types.NullDurationFrom(30 * time.Second)}, TimeUnit: types.NullDurationFrom(time.Second), Rate: null.IntFrom(2), Duration: types.NullDurationFrom(300 * time.Second), PreAllocatedVUs: null.IntFrom(2), MaxVUs: null.IntFrom(10)}
	execution := setupExecutorTest(t, "", "", lib.Options{}, runner, config)
	defer execution.cancel()
	defer c.cancel()
	out := make(chan metrics.SampleContainer, 10000)
	done := make(chan error, 1)
	go func() { done <- execution.executor.Run(execution.ctx, out) }()
	result := inspectorResult{}
	finished := false
	for !finished {
		select {
		case err := <-done:
			require.NoError(t, err)
			finished = true
		case reset := <-c.resets:
			due := reset.delay + reset.elapsed
			ordinal := len(result.timers)
			result.timers = append(result.timers, due)
			if due >= 300*time.Second {
				c.cancel()
				require.NoError(t, <-done)
				t.Fatalf("forbidden ordinal%d reached native timer.Reset at %s before select; expected exactly half-open0..599", ordinal, due)
			}
			require.Equal(t, time.Duration(ordinal)*500*time.Millisecond, due, "actual native due offset")
			if kind == "early-cancel" && ordinal == 37 {
				c.cancel()
				require.NoError(t, <-done)
				finished = true
				break
			}
			if kind == "stalled-slot" && ordinal == 20 {
				c.advance(301 * time.Second)
			} else {
				c.advance(due)
			}
			before := atomic.LoadInt64(&count)
			c.timer.C <- inspectorFiniteNow()
			if kind != "unavailable-max-vu" {
				inspectorWait(t, func() bool {
					return atomic.LoadInt64(&count) == before+1 && execution.state.GetFullIterationCount() == uint64(before+1) && execution.state.GetCurrentlyActiveVUsCount() == 0
				})
				runtime.Gosched()
			} else {
				// Real pool/initialization goroutines run; no TryRunIteration result is
				// supplied. Every genuine unavailable-VU drop remains in native metrics.
				time.Sleep(time.Millisecond)
			}
			if kind == "stalled-slot" && ordinal == 20 {
				c.cancel()
				require.NoError(t, <-done)
				finished = true
			}
			if ordinal == 599 {
				if kind == "both-ready" {
					c.advance(300 * time.Second)
					c.mutex.Lock()
					c.cancelRegular()
					c.mutex.Unlock()
					select {
					case c.timer.C <- inspectorFiniteNow():
					default:
					}
				}
				if kind == "unavailable-max-vu" {
					// The actual original cleanup waits for busy VUs; the controlled maximum
					// context expires at unchanged duration+30s, without replacing cleanup.
					c.advance(330 * time.Second)
					c.mutex.Lock()
					c.cancelMaximum()
					c.mutex.Unlock()
				}
			}
		case <-time.After(5 * time.Second):
			c.cancel()
			t.Fatal("actual native Run exceeded bounded controlled-clock test")
		}
	}
	require.Equal(t, 300*time.Second, c.duration)
	require.Equal(t, 30*time.Second, c.grace)
	result.calls = atomic.LoadInt64(&count)
	result.drops = sumMetricValues(out, metrics.DroppedIterationsName)
	result.initialized = execution.state.GetInitializedVUsCount()
	result.full = execution.state.GetFullIterationCount()
	result.partial = execution.state.GetPartialIterationCount()
	startsMutex.Lock()
	result.actualStarts = append([]time.Duration(nil), starts...)
	startsMutex.Unlock()
	require.Equal(t, int64(0), execution.state.GetCurrentlyActiveVUsCount(), "actual original cleanup must finish")
	t.Logf("native controlled%s timers=%d calls=%d drops=%.0f initialized=%d full=%d partial=%d; no runtime admission", kind, len(result.timers), result.calls, result.drops, result.initialized, result.full, result.partial)
	return result
}

func TestInspectorFiniteExactHalfOpen600(t *testing.T) {
	r := inspectorRun(t, "healthy")
	require.Len(t, r.timers, 600)
	require.Equal(t, int64(600), r.calls)
	require.Equal(t, float64(0), r.drops)
	require.Equal(t, int64(2), r.initialized)
	require.Equal(t, uint64(600), r.full)
	require.Equal(t, uint64(0), r.partial)
}
func TestInspectorFiniteBothReadyBoundary(t *testing.T) {
	r := inspectorRun(t, "both-ready")
	require.Len(t, r.timers, 600)
	require.Equal(t, int64(600), r.calls)
	require.Zero(t, r.drops)
}
func TestInspectorFiniteDelayedStartupKeepsEpoch(t *testing.T) {
	r := inspectorRun(t, "delayed-start")
	require.Len(t, r.timers, 600)
	require.Equal(t, int64(600), r.calls)
	require.Zero(t, r.drops)
	require.Equal(t, 3*time.Second, r.actualStarts[0])
	require.Equal(t, time.Duration(0), r.timers[0])
	require.Equal(t, 299500*time.Millisecond, r.timers[599])
}
func TestInspectorFiniteEarlyCancellationPreservesMissingPopulation(t *testing.T) {
	r := inspectorRun(t, "early-cancel")
	require.Equal(t, int64(37), r.calls)
	require.Equal(t, 38, len(r.timers))
	require.Zero(t, r.drops)
	require.Less(t, r.calls, int64(600))
}
func TestInspectorFiniteStalledSlotRetainsLateDispatchNegative(t *testing.T) {
	r := inspectorRun(t, "stalled-slot")
	require.Equal(t, int64(21), r.calls)
	require.Equal(t, 301*time.Second, r.actualStarts[20])
	require.GreaterOrEqual(t, r.actualStarts[20], 300*time.Second)
	require.Less(t, r.calls, int64(600))
}
func TestInspectorFiniteUnavailableVUsKeepEveryDropAndNoReplacement(t *testing.T) {
	r := inspectorRun(t, "unavailable-max-vu")
	require.Len(t, r.timers, 600)
	require.Equal(t, int64(10), r.initialized)
	require.Equal(t, int64(10), r.calls)
	require.Equal(t, float64(590), r.drops)
	require.Equal(t, float64(600), float64(r.calls)+r.drops)
	require.Zero(t, r.full)
	require.Equal(t, uint64(10), r.partial)
}
