// ==============================================================================
// scripts/compare_m16_thread.ts — Pure TypeScript M16 Thread 3D Cross-Section Renderer
// ==============================================================================

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface CompareThreadOptions {
  stlPath?: string;
  stepPath?: string;
  outPngPath?: string;
}

const FREECAD_CMD = '/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd';

export async function compareM16Thread(options: CompareThreadOptions = {}) {
  const stlPath = options.stlPath || '/Users/roman/Downloads/Metric_thread_testblock_v2.STL';
  const stepPath = options.stepPath || 'test_output/Metric_thread_testblock_v2.step';
  const outPngPath = options.outPngPath || '/Users/roman/.gemini/antigravity/brain/dfb8a7ac-1a40-42c1-b69f-e50a06395c60/m16_thread_comparison.png';

  console.log(`[CompareM16Thread] Comparing M16 thread: ${stlPath} vs ${stepPath}`);

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
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

print("Loading STEP...")
s = Part.Shape()
s.read('${stepPath}')

print("Loading STL...")
stl = Mesh.Mesh('${stlPath}')

xmin, xmax = 5.0, 23.0
ymin, ymax = 6.0, 26.0

fig = plt.figure(figsize=(18, 9), dpi=150)

# 1. STL M16
ax1 = fig.add_subplot(1, 2, 1, projection='3d')
stl_tris = []
for f in stl.Facets:
    pts = f.Points
    cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3.0
    cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3.0
    cz = (pts[0][2] + pts[1][2] + pts[2][2]) / 3.0
    if xmin <= cx <= xmax and ymin <= cy <= ymax and cy >= 16.0:
        stl_tris.append([[p[0], p[1], p[2]] for p in pts])

poly1 = Poly3DCollection(stl_tris, alpha=0.8, edgecolor='black', linewidth=0.2, facecolor='lightblue')
ax1.add_collection3d(poly1)
ax1.set_xlim(xmin, xmax)
ax1.set_ylim(16.0, ymax)
ax1.set_zlim(0, 22)
ax1.set_title(f"ORIGINAL STL M16 Thread (Tris: {len(stl_tris)})")
ax1.view_init(elev=20, azim=45)

# 2. STEP M16
ax2 = fig.add_subplot(1, 2, 2, projection='3d')
step_tris = []
for f in s.Faces:
    bb = f.BoundBox
    cx = (bb.XMin + bb.XMax) / 2.0
    cy = (bb.YMin + bb.YMax) / 2.0
    if xmin <= cx <= xmax and ymin <= cy <= ymax and cy >= 16.0:
        pts = [v.Point for v in f.Vertexes]
        if len(pts) == 3:
            step_tris.append([[p.x, p.y, p.z] for p in pts])
        elif len(pts) == 4:
            step_tris.append([[pts[0].x, pts[0].y, pts[0].z], [pts[1].x, pts[1].y, pts[1].z], [pts[2].x, pts[2].y, pts[2].z]])
            step_tris.append([[pts[0].x, pts[0].y, pts[0].z], [pts[2].x, pts[2].y, pts[2].z], [pts[3].x, pts[3].y, pts[3].z]])
        else:
            try:
                tri = f.triangulate(0.05)
                for node in tri[1]:
                    step_tris.append([[tri[0][node[0]-1].x, tri[0][node[0]-1].y, tri[0][node[0]-1].z],
                                     [tri[0][node[1]-1].x, tri[0][node[1]-1].y, tri[0][node[1]-1].z],
                                     [tri[0][node[2]-1].x, tri[0][node[2]-1].y, tri[0][node[2]-1].z]])
            except:
                pass

poly2 = Poly3DCollection(step_tris, alpha=0.8, edgecolor='black', linewidth=0.2, facecolor='lightgreen')
ax2.add_collection3d(poly2)
ax2.set_xlim(xmin, xmax)
ax2.set_ylim(16.0, ymax)
ax2.set_zlim(0, 22)
ax2.set_title(f"STEP M16 Thread (Tris: {len(step_tris)})")
ax2.view_init(elev=20, azim=45)

plt.tight_layout()
plt.savefig('${outPngPath}', dpi=200)
print("Saved M16 thread render to ${outPngPath}")
import sys
sys.exit(0)
`;

  const tmpScriptPath = path.join(os.tmpdir(), `freecad_compare_m16_${Date.now()}.py`);
  fs.writeFileSync(tmpScriptPath, pyScript, 'utf-8');

  try {
    const stdout = execSync(`${FREECAD_CMD} "${tmpScriptPath}"`, {
      encoding: 'utf-8',
      timeout: 120000
    });
    console.log(stdout.trim());
  } catch (err: any) {
    console.error('[CompareM16Thread] Render failed:', err.message);
    throw err;
  } finally {
    try { fs.unlinkSync(tmpScriptPath); } catch {}
  }
}

if (import.meta.main || process.argv[1]?.endsWith('compare_m16_thread.ts') || process.argv[1]?.endsWith('compare_m16_thread.js')) {
  compareM16Thread({
    stlPath: process.argv[2],
    stepPath: process.argv[3],
    outPngPath: process.argv[4]
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
