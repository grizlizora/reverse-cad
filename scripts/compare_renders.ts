// ==============================================================================
// scripts/compare_renders.ts — Pure TypeScript STL vs STEP Top-View Renderer
// ==============================================================================

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface CompareOptions {
  stlPath?: string;
  stepPath?: string;
  outPngPath?: string;
}

const FREECAD_CMD = '/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd';

export async function compareRenders(options: CompareOptions = {}) {
  const stlPath = options.stlPath || '/Users/roman/Downloads/Metric_thread_testblock_v2.STL';
  const stepPath = options.stepPath || 'test_output/Metric_thread_testblock_v2.step';
  const outPngPath = options.outPngPath || '/Users/roman/.gemini/antigravity/brain/dfb8a7ac-1a40-42c1-b69f-e50a06395c60/stl_vs_step_comparison.png';

  console.log(`[CompareRenders] Comparing STL: ${stlPath} vs STEP: ${stepPath}`);

  if (!fs.existsSync(stlPath)) {
    throw new Error(`STL file not found: ${stlPath}`);
  }
  if (!fs.existsSync(stepPath)) {
    throw new Error(`STEP file not found: ${stepPath}`);
  }

  const pyScript = `
import Part
import Mesh
import matplotlib.pyplot as plt

print("Loading STEP...")
s = Part.Shape()
s.read('${stepPath}')

print("Loading STL...")
stl = Mesh.Mesh('${stlPath}')

fig, axes = plt.subplots(2, 1, figsize=(16, 12), dpi=150)

# Render STL text & top edges
print("Processing STL...")
stl_lines_x = []
stl_lines_y = []
for f in stl.Facets:
    pts = f.Points
    z_max = max(p[2] for p in pts)
    if z_max >= 21.0:
        for i in range(3):
            p1 = pts[i]
            p2 = pts[(i+1)%3]
            stl_lines_x.extend([p1[0], p2[0], None])
            stl_lines_y.extend([p1[1], p2[1], None])

axes[0].plot(stl_lines_x, stl_lines_y, color='black', linewidth=0.3)
axes[0].set_title("ORIGINAL STL (Top View Z >= 21.0 mm)")
axes[0].set_xlim(-5, 130)
axes[0].set_ylim(-5, 70)
axes[0].set_aspect('equal')

# Render STEP edges
print("Processing STEP...")
step_lines_x = []
step_lines_y = []
seen_edges = set()
for f in s.Faces:
    if f.BoundBox.ZMax >= 20.95:
        for e in f.Edges:
            e_hash = e.hashCode()
            if e_hash in seen_edges:
                continue
            seen_edges.add(e_hash)
            if e.Vertexes and len(e.Vertexes) >= 2:
                p1 = e.Vertexes[0].Point
                p2 = e.Vertexes[-1].Point
                step_lines_x.extend([p1.x, p2.x, None])
                step_lines_y.extend([p1.y, p2.y, None])

axes[1].plot(step_lines_x, step_lines_y, color='blue', linewidth=0.3)
axes[1].set_title("GENERATED STEP (Top View Z >= 21.0 mm)")
axes[1].set_xlim(-5, 130)
axes[1].set_ylim(-5, 70)
axes[1].set_aspect('equal')

plt.tight_layout()
plt.savefig('${outPngPath}', dpi=200)
print("Saved comparison render to ${outPngPath}")
import sys
sys.exit(0)
`;

  const tmpScriptPath = path.join(os.tmpdir(), `freecad_compare_renders_${Date.now()}.py`);
  fs.writeFileSync(tmpScriptPath, pyScript, 'utf-8');

  try {
    const stdout = execSync(`${FREECAD_CMD} "${tmpScriptPath}"`, {
      encoding: 'utf-8',
      timeout: 300000
    });
    console.log(stdout.trim());
  } catch (err: any) {
    console.error('[CompareRenders] Render failed:', err.message);
    throw err;
  } finally {
    try { fs.unlinkSync(tmpScriptPath); } catch {}
  }
}

if (import.meta.main || process.argv[1]?.endsWith('compare_renders.ts') || process.argv[1]?.endsWith('compare_renders.js')) {
  compareRenders({
    stlPath: process.argv[2],
    stepPath: process.argv[3],
    outPngPath: process.argv[4]
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
