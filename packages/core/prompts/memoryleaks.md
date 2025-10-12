# Generic Memory Leak Investigation Guide

## 1. Reproduce under observation

**Goal:** confirm the problem, capture data before guessing.

Look for:

- How memory grows over time.
- Whether it ever stabilizes or always rises.
- Which phase (startup, loop, teardown) triggers the climb.

Do:

- Run with verbose GC or heap logging (`--trace-gc`, `-Xlog:gc`, `valgrind`, `perf`, etc.).
- Measure baseline memory before, during, after the test.
- Run a short version first, then longer runs to confirm scaling behavior.

## 2. Check environment assumptions

**Goal:** eliminate false leaks caused by configuration or harness.

Look for:

- Parallel test runners running too many processes.
- Disabled GC or altered memory limits.
- Debug hooks, logging frameworks, or profilers left running.

## 3. Find persistent allocations

**Goal:** identify which objects or resources stay alive.

Look for:

- Heap snapshots showing objects growing in count across iterations.
- Data structures retaining references (lists, maps, caches, observers).
- Static or global variables that accumulate state.
- Event listeners, callbacks, closures that hold references.
- Weak reference misuse (holding strong refs unintentionally).

Tools:

- Language heap dump tools (VisualVM, dotMemory, Instruments, perf, LeakSanitizer).
- Allocation tracing or object histogram diff between start and end.

## 4. Check external resource leaks

**Goal:** rule out leaks that don’t live in managed memory.

Look for:

- File descriptors or sockets not closed.
- Threads or goroutines never exiting.
- Timers, schedulers, tasks still running.
- GPU buffers, handles, DB connections.
- Native resources not freed (in C/C++ bindings or FFI).

Commands / tools:

- `lsof` / `procfd` / system handle inspectors.
- Thread dumps.
- OS memory / handle counters.

## 5. Audit module / object lifecycle

**Goal:** ensure every “create” has a corresponding “destroy.”

Look for:

- Constructors without destructors.
- Listeners subscribed but never unsubscribed.
- Pools or queues not drained.
- Unjoined threads or coroutines.
- Asynchronous tasks not awaited.

Check code paths:

- Initialization vs teardown symmetry.
- Early returns skipping cleanup.
- Exception paths that bypass resource release.

## 6. Inspect caching and memoization

**Goal:** find “legit” but unbounded retention.

Look for:

- Static caches with no eviction policy.
- Memoized function results never cleared.
- Lazy initialization never reset between tests.
- Logging frameworks buffering messages.

## 7. Detect cyclic references

**Goal:** uncover objects keeping each other alive in languages with GC.

Look for:

- Observer patterns, closures, callbacks forming cycles.
- Cross-referencing parent/child structures not using weak refs.
- Graph or DOM-like trees with bidirectional pointers.

## 8. Check for concurrency leaks

**Goal:** identify resources recreated each iteration by multiple threads.

Look for:

- Locks not released.
- Threads or async tasks spawned but never joined.
- Executor pools or dispatch queues growing.
- Channels or queues not drained.

## 9. Measure incremental growth

**Goal:** confirm leak vs. one-time high allocation.

Do:

- Run test N times in a loop, track memory after each.
- If memory plateaus → heavy but stable.
- If memory climbs linearly → leak.

Plot or log memory over time.

## 10. Simplify to isolate

**Goal:** reproduce with smallest possible scenario.

Do:

- Comment out major subsystems incrementally.
- Replace dependencies with stubs.
- Narrow to minimal function or module that leaks.

Once isolated, focus instrumentation there.

## 11. Prove fix

**Goal:** verify stability and cleanup effectiveness.

Do:

- Re-run with heap snapshots before/after.
- Repeat the same test 100+ times; memory should return to baseline.
- Check external handles and thread counts too.

## 12. Root cause categories to expect

1. **Unreleased external handles** (files, sockets, DBs)
2. **Persistent background work** (threads, timers)
3. **Uncleared references** (closures, globals, caches)
4. **Improper cleanup order** (object destroyed after dependent)
5. **Cyclic references** (in GC environments)
6. **Over-retained test doubles / mocks** (unit tests reusing global state)

---

### Summary: What to look for, conceptually

| Category              | What you look for             | Why it leaks                             |
| --------------------- | ----------------------------- | ---------------------------------------- |
| Persistent references | Objects never collected       | Logical leaks in data structures         |
| Background tasks      | Threads/timers still alive    | Scheduler retains closures               |
| External handles      | Files/sockets unclosed        | OS-level resource leak                   |
| Caches                | Growing collections           | Unbounded memory policy                  |
| Cycles                | Objects reference each other  | GC can’t collect                         |
| Async / concurrency   | Tasks or coroutines piling up | Event loop starvation or forgotten joins |

---

### Simplest mental model for a debugging agent

1. **Observe** memory growth → confirm leak.
2. **Trace** which objects/resources persist → identify type of leak.
3. **Isolate** the subsystem causing it.
4. **Eliminate or clean up** the retention source.
5. **Verify** stability by running repeatedly.

That’s the universal pattern, regardless of language or test harness — the tools change, but the intentions stay the same:
**detect, localize, prove, fix, verify.**
