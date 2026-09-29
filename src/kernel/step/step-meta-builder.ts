// ==============================================================================
// src/kernel/step/step-meta-builder.ts — STEP Header, Units, CS & Cartesian Points
// ==============================================================================

import { RawMesh } from '../../types/geometry.js';
import { StepStreamWriter } from './step-stream-writer.js';
import { StepIdAllocator } from './step-id-allocator.js';
import { formatStepFloat, quantizeStepFloat } from './step-orthonormal-basis.js';

export interface StepContextIds {
  idLengthUnit: string;
  idPlaneAngleUnit: string;
  idSolidAngleUnit: string;
  idUncertainty: string;
  idContext: string;
  idOriginPt: string;
  idAxisZ: string;
  idAxisX: string;
  idAxisPlacement: string;
}

export interface PrecomputedStepVertices {
  stepVerticesX: Float64Array;
  stepVerticesY: Float64Array;
  stepVerticesZ: Float64Array;
}

export interface CartesianPointsResult extends PrecomputedStepVertices {
  pointIds: string[];
}

/**
 * Emits ISO 10303-21 header and schema definitions.
 */
export async function writeStepHeader(
  writer: StepStreamWriter,
  modelName: string,
  author: string,
  org: string,
  timestamp: string
): Promise<void> {
  await writer.writeLine('ISO-10303-21;');
  await writer.writeLine('HEADER;');
  await writer.writeLine(`FILE_DESCRIPTION(('STEP AP214', 'STEP AP242', 'Engineered Multi-Body Solid B-Rep with Analytical Surfaces and Semantic Thread Features'), '2;1');`);
  await writer.writeLine(`FILE_NAME('${modelName}.step', '${timestamp}', ('${author}'), ('${org}'), 'Antigravity CAD Kernel v2.1 (Multi-Body)', 'Antigravity Pipeline', '');`);
  await writer.writeLine(`FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }', 'AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF { 1 0 10303 442 1 1 4 }'));`);
  await writer.writeLine('ENDSEC;');
  await writer.writeLine('DATA;');
}

/**
 * Emits SI units, geometric representation context, and world coordinate system.
 */
export async function writeGeometricContext(
  writer: StepStreamWriter,
  allocator: StepIdAllocator
): Promise<StepContextIds> {
  const idLengthUnit = allocator.nextId();
  await writer.writeLine(`${idLengthUnit} = ( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI., .METRE.) );`);

  const idPlaneAngleUnit = allocator.nextId();
  await writer.writeLine(`${idPlaneAngleUnit} = ( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($, .RADIAN.) );`);

  const idSolidAngleUnit = allocator.nextId();
  await writer.writeLine(`${idSolidAngleUnit} = ( NAMED_UNIT(*) SI_UNIT($, .STERADIAN.) SOLID_ANGLE_UNIT() );`);

  const idUncertainty = allocator.nextId();
  await writer.writeLine(`${idUncertainty} = UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.0E-05), ${idLengthUnit}, 'distance_accuracy_value', 'Maximum model tolerance');`);

  const idContext = allocator.nextId();
  await writer.writeLine(`${idContext} = ( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${idUncertainty})) GLOBAL_UNIT_ASSIGNED_CONTEXT((${idLengthUnit}, ${idPlaneAngleUnit}, ${idSolidAngleUnit})) REPRESENTATION_CONTEXT('Context #1', '3D Context with AP242 Semantic PMI') );`);

  // World origin coordinate system
  const idOriginPt = allocator.nextId();
  await writer.writeLine(`${idOriginPt} = CARTESIAN_POINT('Origin', (0.0, 0.0, 0.0));`);
  const idAxisZ = allocator.nextId();
  await writer.writeLine(`${idAxisZ} = DIRECTION('AxisZ', (0.0, 0.0, 1.0));`);
  const idAxisX = allocator.nextId();
  await writer.writeLine(`${idAxisX} = DIRECTION('AxisX', (1.0, 0.0, 0.0));`);
  const idAxisPlacement = allocator.nextId();
  await writer.writeLine(`${idAxisPlacement} = AXIS2_PLACEMENT_3D('World CS', ${idOriginPt}, ${idAxisZ}, ${idAxisX});`);

  return {
    idLengthUnit,
    idPlaneAngleUnit,
    idSolidAngleUnit,
    idUncertainty,
    idContext,
    idOriginPt,
    idAxisZ,
    idAxisX,
    idAxisPlacement
  };
}

/**
 * Emits cartesian points for all referenced vertices in the mesh in batch mode.
 */
export async function writeCartesianPoints(
  writer: StepStreamWriter,
  allocator: StepIdAllocator,
  mesh: RawMesh,
  usedVertices?: Uint8Array,
  precomputedVertices?: PrecomputedStepVertices
): Promise<CartesianPointsResult> {
  const vertexCount = mesh.vertexCount;
  const pointIds: string[] = new Array(vertexCount);
  const stepVerticesX = precomputedVertices?.stepVerticesX ?? new Float64Array(vertexCount);
  const stepVerticesY = precomputedVertices?.stepVerticesY ?? new Float64Array(vertexCount);
  const stepVerticesZ = precomputedVertices?.stepVerticesZ ?? new Float64Array(vertexCount);
  const hasPrecomputed = Boolean(precomputedVertices);

  const coordMap = new Map<string, string>();
  let pointBlock = '';

  for (let i = 0; i < vertexCount; i++) {
    let qx: number;
    let qy: number;
    let qz: number;

    if (hasPrecomputed) {
      qx = stepVerticesX[i];
      qy = stepVerticesY[i];
      qz = stepVerticesZ[i];
    } else {
      const i3 = i * 3;
      qx = quantizeStepFloat(mesh.positions[i3], 5);
      qy = quantizeStepFloat(mesh.positions[i3 + 1], 5);
      qz = quantizeStepFloat(mesh.positions[i3 + 2], 5);
      stepVerticesX[i] = qx;
      stepVerticesY[i] = qy;
      stepVerticesZ[i] = qz;
    }

    if (usedVertices && usedVertices[i] === 0) {
      continue;
    }

    const xStr = formatStepFloat(qx, 5);
    const yStr = formatStepFloat(qy, 5);
    const zStr = formatStepFloat(qz, 5);

    const key = `${xStr},${yStr},${zStr}`;
    let pId = coordMap.get(key);
    if (!pId) {
      pId = allocator.nextId();
      coordMap.set(key, pId);
      pointBlock += `${pId} = CARTESIAN_POINT('', (${xStr}, ${yStr}, ${zStr}));\n`;

      if (pointBlock.length >= 64 * 1024) {
        await writer.writeBlock(pointBlock);
        pointBlock = '';
      }
    }
    pointIds[i] = pId;
  }
  if (pointBlock.length > 0) {
    await writer.writeBlock(pointBlock);
  }

  return {
    pointIds,
    stepVerticesX,
    stepVerticesY,
    stepVerticesZ
  };
}
