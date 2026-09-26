// ==============================================================================
// src/rsvs/procedural-benchmarks.ts — Autonomous Ground-Truth 3D Model Generators
// ==============================================================================

import { RawMesh } from '../types/geometry.js';
import { computeBoundingBox } from '../utils/math3d.js';

/**
 * Procedural Model 1: Prismatic Mechanical Part with M6 tapped hole (5.0mm drill),
 * planar walls, and 100% closed watertight topology (Euler chi = 0 for 1 through hole).
 * Uses zero-allocation flat typed arrays directly.
 */
export function generatePrismaticM6Model(): RawMesh {
  const N = 32;
  const w = 40, h = 20, R = 2.5; // M6 tap drill diameter 5.0mm -> radius 2.5mm

  const totalVertices = N * 4;
  const posArray = new Float32Array(totalVertices * 3);
  const indArray = new Uint32Array(N * 4 * 6);

  // Generate 32 outer perimeter points around square [-20, 20] x [-20, 20] (8 per side)
  const outerCoords: [number, number][] = [];
  const step = w / 8;
  for (let i = 0; i < 8; i++) outerCoords.push([-20 + i * step, -20]);
  for (let i = 0; i < 8; i++) outerCoords.push([20, -20 + i * step]);
  for (let i = 0; i < 8; i++) outerCoords.push([20 - i * step, 20]);
  for (let i = 0; i < 8; i++) outerCoords.push([-20, 20 - i * step]);

  let vPtr = 0;
  const topOuter = new Int32Array(N);
  const topInner = new Int32Array(N);
  const botOuter = new Int32Array(N);
  const botInner = new Int32Array(N);

  for (let i = 0; i < N; i++) {
    const th = (i * 2 * Math.PI) / N;
    const ix = R * Math.cos(th);
    const iy = R * Math.sin(th);
    const [ox, oy] = outerCoords[i];

    const toIdx = vPtr++;
    posArray[toIdx * 3] = ox; posArray[toIdx * 3 + 1] = oy; posArray[toIdx * 3 + 2] = h;
    topOuter[i] = toIdx;

    const tiIdx = vPtr++;
    posArray[tiIdx * 3] = ix; posArray[tiIdx * 3 + 1] = iy; posArray[tiIdx * 3 + 2] = h;
    topInner[i] = tiIdx;

    const boIdx = vPtr++;
    posArray[boIdx * 3] = ox; posArray[boIdx * 3 + 1] = oy; posArray[boIdx * 3 + 2] = 0;
    botOuter[i] = boIdx;

    const biIdx = vPtr++;
    posArray[biIdx * 3] = ix; posArray[biIdx * 3 + 1] = iy; posArray[biIdx * 3 + 2] = 0;
    botInner[i] = biIdx;
  }

  let iPtr = 0;
  const addQuad = (v0: number, v1: number, v2: number, v3: number) => {
    indArray[iPtr++] = v0; indArray[iPtr++] = v1; indArray[iPtr++] = v2;
    indArray[iPtr++] = v0; indArray[iPtr++] = v2; indArray[iPtr++] = v3;
  };

  for (let i = 0; i < N; i++) {
    const next = (i + 1) % N;
    // Top face
    addQuad(topOuter[i], topOuter[next], topInner[next], topInner[i]);
    // Bottom face
    addQuad(botOuter[next], botOuter[i], botInner[i], botInner[next]);
    // Outer side wall
    addQuad(topOuter[i], botOuter[i], botOuter[next], topOuter[next]);
    // Inner hole cylinder
    addQuad(topInner[next], botInner[next], botInner[i], topInner[i]);
  }

  return {
    positions: posArray,
    indices: indArray,
    vertexCount: totalVertices,
    triangleCount: indArray.length / 3,
    boundingBox: computeBoundingBox(posArray)
  };
}

/**
 * Procedural Model 2: Subsurface Internal Labyrinth / Cavity
 */
export function generateInternalLabyrinthModel(): RawMesh {
  const outer = generateBoxMesh(50, 50, 30, [0, 0, 0], false);
  const inner = generateBoxMesh(30, 30, 15, [10, 10, 7.5], true);
  return mergeMeshes(outer, inner);
}

/**
 * Procedural Model 3: Print-in-Place Hinge with known 0.35 mm clearance
 */
export function generatePrintInPlaceHingeModel(): RawMesh {
  const clearance = 0.35;
  const link1 = generateBoxMesh(20, 15, 10, [0, 0, 0], false);
  const link2 = generateBoxMesh(20, 15, 10, [20 + clearance, 0, 0], false);
  return mergeMeshes(link1, link2);
}

/**
 * Procedural Model 4: Organic Freeform Saddle Surface with solid closed base
 */
export function generateOrganicSaddleModel(): RawMesh {
  const gridSize = 16;
  const step = 2.0;
  const baseZ = -15.0; // Flat bottom level

  const totalGridVerts = (gridSize + 1) * (gridSize + 1);
  const totalVertices = totalGridVerts * 2;
  const posArray = new Float32Array(totalVertices * 3);
  const totalIndices = (gridSize * gridSize * 2 * 3) * 2 + (4 * gridSize * 2 * 3);
  const indArray = new Uint32Array(totalIndices);

  let vPtr = 0;
  // Top grid vertices
  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const x = (i - gridSize / 2) * step;
      const y = (j - gridSize / 2) * step;
      const z = (x * x - y * y) / 25.0;
      posArray[vPtr++] = x;
      posArray[vPtr++] = y;
      posArray[vPtr++] = z;
    }
  }

  // Flat bottom vertices
  const botBase = totalGridVerts;
  for (let i = 0; i <= gridSize; i++) {
    for (let j = 0; j <= gridSize; j++) {
      const x = (i - gridSize / 2) * step;
      const y = (j - gridSize / 2) * step;
      posArray[vPtr++] = x;
      posArray[vPtr++] = y;
      posArray[vPtr++] = baseZ;
    }
  }

  let iPtr = 0;
  // Top surface triangles
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const row1 = i * (gridSize + 1);
      const row2 = (i + 1) * (gridSize + 1);

      indArray[iPtr++] = row1 + j; indArray[iPtr++] = row2 + j; indArray[iPtr++] = row1 + j + 1;
      indArray[iPtr++] = row1 + j + 1; indArray[iPtr++] = row2 + j; indArray[iPtr++] = row2 + j + 1;
    }
  }

  // Bottom surface triangles
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const row1 = botBase + i * (gridSize + 1);
      const row2 = botBase + (i + 1) * (gridSize + 1);

      indArray[iPtr++] = row1 + j; indArray[iPtr++] = row1 + j + 1; indArray[iPtr++] = row2 + j;
      indArray[iPtr++] = row1 + j + 1; indArray[iPtr++] = row2 + j + 1; indArray[iPtr++] = row2 + j;
    }
  }

  // 4 Side walls connecting top boundary to bottom boundary
  const addWallQuad = (topA: number, topB: number, botA: number, botB: number) => {
    indArray[iPtr++] = topA; indArray[iPtr++] = topB; indArray[iPtr++] = botB;
    indArray[iPtr++] = topA; indArray[iPtr++] = botB; indArray[iPtr++] = botA;
  };

  for (let j = 0; j < gridSize; j++) {
    addWallQuad(j, j + 1, botBase + j, botBase + j + 1);
    const rowTop = gridSize * (gridSize + 1);
    const rowBot = botBase + gridSize * (gridSize + 1);
    addWallQuad(rowTop + j + 1, rowTop + j, rowBot + j + 1, rowBot + j);
  }

  for (let i = 0; i < gridSize; i++) {
    const topA = (i + 1) * (gridSize + 1);
    const topB = i * (gridSize + 1);
    const botA = botBase + (i + 1) * (gridSize + 1);
    const botB = botBase + i * (gridSize + 1);
    addWallQuad(topA, topB, botA, botB);

    const topA2 = i * (gridSize + 1) + gridSize;
    const topB2 = (i + 1) * (gridSize + 1) + gridSize;
    const botA2 = botBase + i * (gridSize + 1) + gridSize;
    const botB2 = botBase + (i + 1) * (gridSize + 1) + gridSize;
    addWallQuad(topA2, topB2, botA2, botB2);
  }

  return {
    positions: posArray,
    indices: indArray,
    vertexCount: totalVertices,
    triangleCount: indArray.length / 3,
    boundingBox: computeBoundingBox(posArray)
  };
}

function generateBoxMesh(w: number, d: number, h: number, offset: [number, number, number], invert: boolean): RawMesh {
  const x0 = offset[0], y0 = offset[1], z0 = offset[2];
  const x1 = x0 + w, y1 = y0 + d, z1 = z0 + h;

  const posArray = new Float32Array([
    x0, y0, z0,
    x1, y0, z0,
    x1, y1, z0,
    x0, y1, z0,
    x0, y0, z1,
    x1, y0, z1,
    x1, y1, z1,
    x0, y1, z1
  ]);

  const quads = [
    [0, 3, 2, 1], // Bottom (-Z)
    [4, 5, 6, 7], // Top (+Z)
    [0, 1, 5, 4], // Front (-Y)
    [1, 2, 6, 5], // Right (+X)
    [2, 3, 7, 6], // Back (+Y)
    [3, 0, 4, 7]  // Left (-X)
  ];

  const indArray = new Uint32Array(36);
  let iPtr = 0;
  for (let k = 0; k < quads.length; k++) {
    const q = quads[k];
    if (!invert) {
      indArray[iPtr++] = q[0]; indArray[iPtr++] = q[1]; indArray[iPtr++] = q[2];
      indArray[iPtr++] = q[0]; indArray[iPtr++] = q[2]; indArray[iPtr++] = q[3];
    } else {
      indArray[iPtr++] = q[0]; indArray[iPtr++] = q[2]; indArray[iPtr++] = q[1];
      indArray[iPtr++] = q[0]; indArray[iPtr++] = q[3]; indArray[iPtr++] = q[2];
    }
  }

  return {
    positions: posArray,
    indices: indArray,
    vertexCount: 8,
    triangleCount: 12,
    boundingBox: computeBoundingBox(posArray)
  };
}

function mergeMeshes(m1: RawMesh, m2: RawMesh): RawMesh {
  const totalPos = new Float32Array(m1.positions.length + m2.positions.length);
  totalPos.set(m1.positions, 0);
  totalPos.set(m2.positions, m1.positions.length);

  const vOffset = m1.vertexCount;
  const totalIndices = new Uint32Array(m1.indices.length + m2.indices.length);
  totalIndices.set(m1.indices, 0);
  for (let i = 0; i < m2.indices.length; i++) {
    totalIndices[m1.indices.length + i] = m2.indices[i] + vOffset;
  }

  return {
    positions: totalPos,
    indices: totalIndices,
    vertexCount: totalPos.length / 3,
    triangleCount: totalIndices.length / 3,
    boundingBox: computeBoundingBox(totalPos)
  };
}
