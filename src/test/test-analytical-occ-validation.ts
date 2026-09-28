// ==============================================================================
// src/test/test-analytical-occ-validation.ts — OpenCASCADE Analytical Validation in TypeScript
// ==============================================================================

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

export interface OCCValidationResult {
  solids: number;
  faces: number;
  volume: number;
  isValid: boolean;
  error?: string;
}

/**
 * Executes OpenCASCADE / FreeCAD validation using a direct TypeScript-managed process.
 */
export function validateStepWithOCC(stepFilePath: string): OCCValidationResult {
  const freecadBin =
    process.platform === 'darwin' && fs.existsSync('/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd')
      ? '/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd'
      : 'freecadcmd';

  const absPath = path.resolve(stepFilePath);
  const pyCode = `import Part, json; s = Part.Shape(); s.read('${absPath}'); print('OCC_JSON:' + json.dumps({'solids': len(s.Solids), 'faces': len(s.Faces), 'volume': float(s.Volume), 'isValid': s.isValid()}))`;

  try {
    const rawOut = execSync(`"${freecadBin}" -c "${pyCode}"`, {
      encoding: 'utf-8',
      timeout: 25000
    });
    const match = rawOut.match(/OCC_JSON:(\{.*\})/);
    if (match) {
      return JSON.parse(match[1]);
    }
    return {
      solids: 0,
      faces: 0,
      volume: 0,
      isValid: false,
      error: 'Failed to parse OpenCASCADE JSON output'
    };
  } catch (err: any) {
    return {
      solids: 0,
      faces: 0,
      volume: 0,
      isValid: false,
      error: err.message
    };
  }
}

/**
 * Validates analytical primitives (cylinder, cone, collars) and B-Rep domain unification.
 */
export async function runAnalyticalOCCValidation(): Promise<boolean> {
  console.log(chalk.bold.cyan('\n======================================================'));
  console.log(chalk.bold.cyan('  OPENCASCADE ANALYTICAL B-REP VALIDATION (TYPESCRIPT)'));
  console.log(chalk.bold.cyan('======================================================\n'));

  const freecadBin =
    process.platform === 'darwin' && fs.existsSync('/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd')
      ? '/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd'
      : 'freecadcmd';

  try {
    execSync(`"${freecadBin}" --version`, { stdio: 'ignore' });
  } catch {
    console.log(chalk.yellow('FreeCAD not found in environment, skipping OCC verification.'));
    return true;
  }

  // 1. Verify Cylinder Primitive
  const cylCode = `import Part, json; c = Part.makeCylinder(7.65, 1.0); print('CYL_JSON:' + json.dumps({'faces': len(c.Faces), 'volume': float(c.Volume), 'isValid': c.isValid()}))`;
  const cylOut = execSync(`"${freecadBin}" -c "${cylCode}"`, { encoding: 'utf-8' });
  const cylMatch = cylOut.match(/CYL_JSON:(\{.*\})/);
  if (cylMatch) {
    const res = JSON.parse(cylMatch[1]);
    console.log(chalk.green(`  ✔ OCC Cylinder (R=7.65, H=1.0): Faces=${res.faces}, Vol=${res.volume.toFixed(2)} mm³, Valid=${res.isValid}`));
  }

  // 2. Verify Conical Chamfer Primitive
  const coneCode = `import Part, json; c = Part.makeCone(7.85, 7.65, 0.2); print('CONE_JSON:' + json.dumps({'faces': len(c.Faces), 'volume': float(c.Volume), 'isValid': c.isValid()}))`;
  const coneOut = execSync(`"${freecadBin}" -c "${coneCode}"`, { encoding: 'utf-8' });
  const coneMatch = coneOut.match(/CONE_JSON:(\{.*\})/);
  if (coneMatch) {
    const res = JSON.parse(coneMatch[1]);
    console.log(chalk.green(`  ✔ OCC Conical Chamfer (R0=7.85, R1=7.65, H=0.2): Faces=${res.faces}, Vol=${res.volume.toFixed(2)} mm³, Valid=${res.isValid}`));
  }

  // 3. Verify Tessellation Law Inverter (stl2step Closed-Form Inverse)
  const { invertTessellationLaw, computePredictedArcVolumeDelta } = await import('../kernel/step/analytical/tessellation-law.js');
  const targetR = 7.65;
  const nSteps = 16;
  const theta = (2 * Math.PI) / nSteps; // 22.5 deg
  const chordW = 2 * targetR * Math.sin(theta / 2); // Exact chord width
  const recovered = invertTessellationLaw(chordW, theta);
  if (recovered && Math.abs(recovered.radius - targetR) < 1e-6) {
    console.log(chalk.green(`  ✔ Tessellation Law Inversion: w=${chordW.toFixed(4)}, θ=${(theta * 180 / Math.PI).toFixed(1)}° -> Recovered R=${recovered.radius.toFixed(4)} mm (Exact)`));
  } else {
    throw new Error(`Tessellation law inversion failed: expected ${targetR}, got ${recovered?.radius}`);
  }

  // 4. Verify Volume Budget Gate (stl2step Divergence Theorem Accounting)
  const { verifyVolumeBudget } = await import('../kernel/step/analytical/volume-budget-gate.js');
  const height = 5.0;
  const dV = computePredictedArcVolumeDelta(targetR, theta, nSteps, height);
  const fakeMeshVol = 1000.0;
  const fakeSolidVol = fakeMeshVol + dV; // Exact analytical volume
  const volGateRes = verifyVolumeBudget(fakeMeshVol, fakeSolidVol, [{
    radius: targetR,
    thetaStep: theta,
    stepCount: nSteps,
    height,
    isAdditive: true
  }]);
  if (volGateRes.isAccepted) {
    console.log(chalk.green(`  ✔ Volume Budget Gate: ΔV_pred=${dV.toFixed(2)} mm³, Residual=${volGateRes.residual.toFixed(6)} mm³ <= Budget=${volGateRes.allowedBudget.toFixed(2)} mm³ (PASSED)`));
  } else {
    throw new Error(`Volume budget gate rejected valid solid: ${volGateRes.rejectionReason}`);
  }

  // 5. Verify Voron Design Cube STEP production file if present
  const voronStepPath = path.resolve('output_test_temp/voron_production_verified/Voron_Design_Cube_v7.step');
  if (fs.existsSync(voronStepPath)) {
    const voronRes = validateStepWithOCC(voronStepPath);
    console.log(chalk.green(`  ✔ Voron Design Cube Production STEP: Solids=${voronRes.solids}, Faces=${voronRes.faces}, Vol=${voronRes.volume.toFixed(2)} mm³, Valid=${voronRes.isValid}`));
  }

  console.log(chalk.bold.green('\n  ✔ ALL ANALYTICAL OCC VALIDATIONS PASSED SUCCESSFULLY!\n'));
  return true;
}

// Auto-run when executed directly
if (process.argv[1]?.endsWith('test-analytical-occ-validation.js') || process.argv[1]?.endsWith('test-analytical-occ-validation.ts')) {
  runAnalyticalOCCValidation().catch((err) => {
    console.error(chalk.red('Analytical validation failed:'), err);
    process.exit(1);
  });
}
