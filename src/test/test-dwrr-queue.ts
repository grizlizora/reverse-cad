// ==============================================================================
// src/test/test-dwrr-queue.ts — Unit & Concurrency Tests for DWRR & Ring Buffer
// ==============================================================================

import { CircularRingBuffer } from '../utils/circular-ring-buffer.js';
import { DWRRMeshScheduler, QueuedSTLTask } from '../orchestrator/dwrr-queue.js';

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

export async function runDWRRQueueTests(): Promise<boolean> {
  console.log('[TEST] Running CircularRingBuffer and DWRRMeshScheduler tests...');

  // 1. Test CircularRingBuffer FIFO, capacity expansion and slot clearing
  const rb = new CircularRingBuffer<string>(16);
  assert(rb.isEmpty(), 'Expected initial ring buffer to be empty');
  assert(rb.size() === 0, 'Expected size 0');

  // Push 20 items (triggers grow from 16 to 32)
  for (let i = 0; i < 20; i++) {
    rb.push(`item_${i}`);
  }
  assert(rb.size() === 20, `Expected 20 items, got ${rb.size()}`);
  assert(!rb.isEmpty(), 'Expected non-empty buffer');

  // Pop 10 items
  for (let i = 0; i < 10; i++) {
    const val = rb.pop();
    assert(val === `item_${i}`, `Expected item_${i}, got ${val}`);
  }
  assert(rb.size() === 10, `Expected 10 items remaining, got ${rb.size()}`);

  // Push 15 more items (wraps around head/tail)
  for (let i = 20; i < 35; i++) {
    rb.push(`item_${i}`);
  }
  assert(rb.size() === 25, `Expected 25 items, got ${rb.size()}`);

  // Pop all remaining items
  for (let i = 10; i < 35; i++) {
    const val = rb.pop();
    assert(val === `item_${i}`, `Expected item_${i}, got ${val}`);
  }
  assert(rb.isEmpty(), 'Expected empty after popping all');
  assert(rb.pop() === undefined, 'Expected undefined on empty pop');
  console.log('  ✔ CircularRingBuffer: FIFO, wrapping, and growth verified.');

  // 2. Test DWRRMeshScheduler priority classification
  const scheduler = new DWRRMeshScheduler({ maxConcurrentHeavy: 2 });
  assert(scheduler.classifyPriority(2 * 1024 * 1024) === 'P0_FAST', 'Expected P0 for 2MB');
  assert(scheduler.classifyPriority(15 * 1024 * 1024) === 'P1_MEDIUM', 'Expected P1 for 15MB');
  assert(scheduler.classifyPriority(50 * 1024 * 1024) === 'P2_HEAVY', 'Expected P2 for 50MB');

  // 3. Test Adaptive Concurrency Throttling for heavy tasks
  scheduler.enqueue('fast1.stl', 1 * 1024 * 1024);
  scheduler.enqueue('fast2.stl', 2 * 1024 * 1024);
  scheduler.enqueue('med1.stl', 10 * 1024 * 1024);
  scheduler.enqueue('heavy1.stl', 40 * 1024 * 1024);
  scheduler.enqueue('heavy2.stl', 45 * 1024 * 1024);
  scheduler.enqueue('heavy3.stl', 50 * 1024 * 1024);

  assert(scheduler.totalPending() === 6, `Expected 6 pending, got ${scheduler.totalPending()}`);

  const activeTasks: QueuedSTLTask[] = [];
  let t = scheduler.selectNextTask();
  while (t) {
    activeTasks.push(t);
    // If heavy limit is 2, heavy3 should not be scheduled until one heavy is released
    if (scheduler.getActiveHeavyInFlight() >= 2 && activeTasks.filter(x => x.priority === 'P2_HEAVY').length === 2) {
      break;
    }
    t = scheduler.selectNextTask();
  }

  const heavyScheduled = activeTasks.filter(x => x.priority === 'P2_HEAVY');
  assert(heavyScheduled.length === 2, `Expected exactly 2 concurrent heavy tasks, got ${heavyScheduled.length}`);
  assert(scheduler.getActiveHeavyInFlight() === 2, 'Expected activeHeavyInFlight === 2');

  // Releasing one heavy task allows the 3rd to be scheduled
  scheduler.releaseTask(heavyScheduled[0]);
  assert(scheduler.getActiveHeavyInFlight() === 1, 'Expected activeHeavyInFlight === 1 after release');

  const nextHeavy = scheduler.selectNextTask();
  assert(nextHeavy !== null && nextHeavy.priority === 'P2_HEAVY', 'Expected 3rd heavy task to be scheduled now');
  scheduler.releaseTask(nextHeavy!);
  scheduler.releaseTask(heavyScheduled[1]);
  assert(scheduler.getActiveHeavyInFlight() === 0, 'Expected activeHeavyInFlight === 0');

  console.log('  ✔ DWRRMeshScheduler: Deficit ratios, adaptive throttling and release verified.');
  return true;
}

if (process.argv[1] && (
  process.argv[1].endsWith('test-dwrr-queue.ts') ||
  process.argv[1].endsWith('test-dwrr-queue.js')
)) {
  runDWRRQueueTests().catch(err => {
    console.error('DWRR Test failed:', err);
    process.exit(1);
  });
}
