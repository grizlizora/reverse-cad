/**
 * Monotonic Cyclic Angle Sweep Triangulator between two closed 2D loops.
 * Guarantees that EVERY top edge and EVERY bottom edge is covered EXACTLY ONCE.
 * Resulting triangulated band has ZERO free/boundary edges along interior seams
 * and matches the top and bottom loops with 100% topological closure.
 */
import { computeOrthonormalBasis } from '../step-orthonormal-basis.js';

export interface TriangulatedBandFace {
  v0: number;
  v1: number;
  v2: number;
}

export function triangulateBetweenLoops(
  topLoop: number[], // ordered CW (area < 0) or CCW
  botLoop: number[], // ordered CCW (area > 0)
  stepVerticesX: Float64Array,
  stepVerticesY: Float64Array,
  stepVerticesZ: Float64Array,
  cx: number,
  cy: number,
  cz: number,
  normal: [number, number, number] = [0, 0, 1]
): TriangulatedBandFace[] {
  const M = topLoop.length;
  const N = botLoop.length;
  if (M < 3 || N < 3) return [];

  const basis = computeOrthonormalBasis(normal);
  const u = basis.dirX;
  const Z = basis.dirZ;
  const v: [number, number, number] = [
    Z[1] * u[2] - Z[2] * u[1],
    Z[2] * u[0] - Z[0] * u[2],
    Z[0] * u[1] - Z[1] * u[0]
  ];

  // Compute angles for both loops relative to (cx, cy, cz) on transverse plane
  const getAngle = (vert: number) => {
    const dx = stepVerticesX[vert] - cx;
    const dy = stepVerticesY[vert] - cy;
    const dz = stepVerticesZ[vert] - cz;
    const px = dx * u[0] + dy * u[1] + dz * u[2];
    const py = dx * v[0] + dy * v[1] + dz * v[2];
    let a = Math.atan2(py, px);
    if (a < 0) a += 2 * Math.PI;
    return a;
  };

  // 2D Gauss signed polygon area to determine loop orientation (CW vs CCW)
  const computeSignedArea = (loop: number[]): number => {
    let area2 = 0;
    const len = loop.length;
    for (let k = 0; k < len; k++) {
      const v0 = loop[k], v1 = loop[(k + 1) % len];
      const dx0 = stepVerticesX[v0] - cx, dy0 = stepVerticesY[v0] - cy, dz0 = stepVerticesZ[v0] - cz;
      const px0 = dx0 * u[0] + dy0 * u[1] + dz0 * u[2], py0 = dx0 * v[0] + dy0 * v[1] + dz0 * v[2];
      const dx1 = stepVerticesX[v1] - cx, dy1 = stepVerticesY[v1] - cy, dz1 = stepVerticesZ[v1] - cz;
      const px1 = dx1 * u[0] + dy1 * u[1] + dz1 * u[2], py1 = dx1 * v[0] + dy1 * v[1] + dz1 * v[2];
      area2 += px0 * py1 - px1 * py0;
    }
    return area2;
  };

  const isClockwise = (loop: number[]): boolean => {
    const area2 = computeSignedArea(loop);
    if (Math.abs(area2) > 1e-9) return area2 < 0;
    let totalAngle = 0;
    for (let k = 0; k < loop.length; k++) {
      let diff = getAngle(loop[(k + 1) % loop.length]) - getAngle(loop[k]);
      if (diff < -Math.PI) diff += 2 * Math.PI;
      else if (diff > Math.PI) diff -= 2 * Math.PI;
      totalAngle += diff;
    }
    return totalAngle < 0;
  };

  // Ensure both loops are ordered in CCW increasing angular direction
  let tOrdered = topLoop.slice();
  let bOrdered = botLoop.slice();
  if (isClockwise(tOrdered)) tOrdered.reverse();
  if (isClockwise(bOrdered)) bOrdered.reverse();

  // Find index in tOrdered and bOrdered with minimum angle closest to 0
  let tStart = 0, bStart = 0;
  let tMinA = Infinity, bMinA = Infinity;
  for (let i = 0; i < M; i++) {
    const a = getAngle(tOrdered[i]);
    if (a < tMinA) { tMinA = a; tStart = i; }
  }
  for (let j = 0; j < N; j++) {
    const a = getAngle(bOrdered[j]);
    if (a < bMinA) { bMinA = a; bStart = j; }
  }

  // Rotate arrays so they start near angle 0
  const tRot = tOrdered.slice(tStart).concat(tOrdered.slice(0, tStart));
  const bRot = bOrdered.slice(bStart).concat(bOrdered.slice(0, bStart));

  // Compute unwrapped cumulative angles in [0, 2*pi]
  const tAng = new Float64Array(M + 1);
  const bAng = new Float64Array(N + 1);

  let prev = getAngle(tRot[0]);
  tAng[0] = prev;
  for (let i = 1; i < M; i++) {
    const raw = getAngle(tRot[i]);
    let diff = raw - (prev % (2 * Math.PI));
    if (diff < -Math.PI) diff += 2 * Math.PI;
    else if (diff > Math.PI) diff -= 2 * Math.PI;
    let curr = prev + diff;
    if (curr < prev) curr = prev;
    tAng[i] = curr;
    prev = curr;
  }
  tAng[M] = tAng[0] + 2 * Math.PI;

  prev = getAngle(bRot[0]);
  bAng[0] = prev;
  for (let j = 1; j < N; j++) {
    const raw = getAngle(bRot[j]);
    let diff = raw - (prev % (2 * Math.PI));
    if (diff < -Math.PI) diff += 2 * Math.PI;
    else if (diff > Math.PI) diff -= 2 * Math.PI;
    let curr = prev + diff;
    if (curr < prev) curr = prev;
    bAng[j] = curr;
    prev = curr;
  }
  bAng[N] = bAng[0] + 2 * Math.PI;

  // Align starting offset so |tAng[0] - bAng[0]| is minimal
  if (Math.abs(tAng[0] - bAng[0]) > Math.PI) {
    if (tAng[0] > bAng[0]) {
      for (let j = 0; j <= N; j++) bAng[j] += 2 * Math.PI;
    } else {
      for (let i = 0; i <= M; i++) tAng[i] += 2 * Math.PI;
    }
  }

  // Two-pointer sweep:
  let i = 0, j = 0;
  const faces: TriangulatedBandFace[] = [];

  while (i < M || j < N) {
    const tCurr = tRot[i % M];
    const tNext = tRot[(i + 1) % M];
    const bCurr = bRot[j % N];
    const bNext = bRot[(j + 1) % N];

    if (i === M) {
      // Must advance j
      // Face between tCurr, bCurr, bNext
      // Top vertex is tCurr (fixed), bottom edge is bCurr -> bNext
      faces.push({ v0: tCurr, v1: bNext, v2: bCurr });
      j++;
    } else if (j === N) {
      // Must advance i
      // Top edge is tCurr -> tNext, bottom vertex is bCurr (fixed)
      faces.push({ v0: tNext, v1: bCurr, v2: tCurr });
      i++;
    } else {
      // Both can advance: pick the one whose normalized progress is smaller
      const progT = (tAng[i + 1] - tAng[0]) / (tAng[M] - tAng[0]);
      const progB = (bAng[j + 1] - bAng[0]) / (bAng[N] - bAng[0]);

      if (progT <= progB) {
        // Advance i: top edge tCurr -> tNext
        faces.push({ v0: tNext, v1: bCurr, v2: tCurr });
        i++;
      } else {
        // Advance j: bottom edge bCurr -> bNext
        faces.push({ v0: tCurr, v1: bNext, v2: bCurr });
        j++;
      }
    }
  }

  return faces;
}
