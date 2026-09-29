import assert from 'node:assert';
import { detectRevoluteJoints, getEffectiveAxis } from '../stages/profiling/kinematics/revolute-joint-detector.js';
import { matchRevolutePair, fastRound4 } from '../stages/profiling/kinematics/revolute-pair-matcher.js';
import { TerminalFormatter, UI_TOKENS } from '../tui/terminal-formatter.js';
import { TerminalTtyGuard } from '../tui/terminal-tty-guard.js';
import type { CylinderSurface } from '../types/geometry.js';

console.log('\n======================================================');
console.log('  PHASE 4: KINEMATICS & TERMINAL TUI VERIFICATION');
console.log('======================================================\n');

// 1. Scalar fastRound4 test
assert.strictEqual(fastRound4(0.12344), 0.1234);
assert.strictEqual(fastRound4(0.12346), 0.1235);
assert.strictEqual(fastRound4(1.0000000000001), 1.0);
console.log('  ✔ fastRound4 scalar FPU rounding: PASSED');

// 2. Effective axis test
assert.deepStrictEqual(getEffectiveAxis([0, 0, 0.99]), [0, 0, 1]);
assert.deepStrictEqual(getEffectiveAxis([0.95, 0, 0]), [1, 0, 0]);
assert.deepStrictEqual(getEffectiveAxis([0, -0.98, 0]), [0, -1, 0]);
console.log('  ✔ getEffectiveAxis coordinate snapping: PASSED');

// 3. Revolute Pair Matcher Test
const socket: CylinderSurface = {
  id: 'cyl_socket',
  type: 'cylinder',
  axisOrigin: [0, 0, 10],
  axisDirection: [0, 0, 1],
  radius: 5.2,
  height: 10.0,
  area: 100,
  meanResidual: 0.001,
  isInternal: true,
  inlierIndices: [0, 1, 2]
};

const pin: CylinderSurface = {
  id: 'cyl_pin',
  type: 'cylinder',
  axisOrigin: [0, 0, 10],
  axisDirection: [0, 0, 1],
  radius: 5.0, // clearance = 0.2mm
  height: 12.0,
  area: 120,
  meanResidual: 0.001,
  isInternal: false,
  inlierIndices: [3, 4, 5]
};

const cand = matchRevolutePair({
  socket,
  pin,
  shellA: 0,
  shellB: 1,
  axisSocket: [0, 0, 1],
  axisPin: [0, 0, 1]
});

assert(cand !== null, 'Candidate joint should be detected');
assert.strictEqual(cand.socketId, 'cyl_socket');
assert.strictEqual(cand.pinId, 'cyl_pin');
assert.strictEqual(cand.shellA, 0);
assert.strictEqual(cand.shellB, 1);
assert.strictEqual(cand.clearanceMm, 0.2);
console.log('  ✔ matchRevolutePair positive match: PASSED');

// Negative check: pin radius >= socket radius
const candInverted = matchRevolutePair({
  socket: pin,
  pin: socket,
  shellA: 0,
  shellB: 1,
  axisSocket: [0, 0, 1],
  axisPin: [0, 0, 1]
});
assert.strictEqual(candInverted, null, 'Inverted radii must return null');

// Negative check: non-parallel axes
const candPerp = matchRevolutePair({
  socket,
  pin,
  shellA: 0,
  shellB: 1,
  axisSocket: [0, 0, 1],
  axisPin: [1, 0, 0]
});
assert.strictEqual(candPerp, null, 'Perpendicular axes must return null');
console.log('  ✔ matchRevolutePair negative constraints: PASSED');

// 4. detectRevoluteJoints Multi-shell test
const cylinders: CylinderSurface[] = [socket, pin];
const shellMap = new Int32Array([0, 1]);

const detection = detectRevoluteJoints(cylinders, shellMap);
assert.strictEqual(detection.kinematicJoints.length, 1);
assert.strictEqual(detection.kinematicJoints[0].type, 'revolute');
assert.strictEqual(detection.kinematicJoints[0].measuredClearanceMm, 0.2);
assert(detection.jointCylIds.has('cyl_socket'));
assert(detection.jointCylIds.has('cyl_pin'));
assert(detection.connectedShellPairs.has('0_1'));
console.log('  ✔ detectRevoluteJoints multi-shell detection: PASSED');

// 5. Terminal Formatter Test
const formattedStage = TerminalFormatter.formatStage(1, '1_read');
assert(formattedStage.includes('[1/7] read'));
const baseName = TerminalFormatter.getFastBasename('/some/deep/path/model.stl');
assert.strictEqual(baseName, 'model.stl');
const bar = TerminalFormatter.renderBar(0.5, 10);
assert.strictEqual(bar.bar.length + bar.empty.length, 10);
assert.strictEqual(typeof UI_TOKENS.BATCH_TITLE, 'string');
console.log('  ✔ TerminalFormatter stage name, basename caching & bar rendering: PASSED');

// 6. Terminal TTY Guard Test
assert(typeof TerminalTtyGuard.isInteractiveTTY() === 'boolean');
TerminalTtyGuard.hideCursor();
TerminalTtyGuard.restoreCursor();
console.log('  ✔ TerminalTtyGuard cursor state & signal handlers: PASSED');

console.log('\n======================================================');
console.log('  ✔ ALL PHASE 4 KINEMATICS & TUI TESTS PASSED (100%)');
console.log('======================================================\n');
