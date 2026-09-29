// ==============================================================================
// scripts/render_qem_verification.ts — Pure TypeScript QEM Thread Verification Renderer
// ==============================================================================

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface RenderQemOptions {
  origStlPath?: string;
  decimatedStlPath?: string;
  outPngPath?: string;
}

const FREECAD_CMD = '/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd';

export async function renderQemVerification(options: RenderQemOptions = {}) {
  const origStlPath = options.origStlPath || '/Users/roman/Downloads/Metric_thread_testblock_v2.STL';
  const decimatedStlPath = options.decimatedStlPath || 'test_output/decimated_test.stl';
  const outPngPath = options.outPngPath || '/Users/roman/.gemini/antigravity/brain/dfb8a7ac-1a40-42c1-b69f-e50a06395c60/qem_m16_comparison.png';

  console.log(`[RenderQEMVerification] Comparing ${origStlPath} vs ${decimatedStlPath}`);

  if (!fs.existsSync(origStlPath)) {
    throw new Error(`Original STL file not found: ${origStlPath}`);
  }
  if (!fs.existsSync(decimatedStlPath)) {
    throw new Error(`Decimated STL file not found: ${decimatedStlPath}`);
  }

  const pyScript = `
import Mesh
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection

print("Loading original STL...")
stl_orig = Mesh.Mesh('${origStlPath}')

print("Loading QEM decimated STL...")
stl_qem = Mesh.Mesh('${decimatedStlPath}')

fig = plt.figure(figsize=(18, 9), dpi=150)
xmin, xmax = 5.0, 23.0
ymin, ymax = 6.0, 26.0

# Subplot 1: Original M16
ax1 = fig.add_subplot(1, 2, 1, projection='3d')
tris1 = []
for f in stl_orig.Facets:
    pts = f.Points
    cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3.0
    cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3.0
    cz = (pts[0][2] + pts[1][2] + pts[2][2]) / 3.0
    if xmin <= cx <= xmax and ymin <= cy <= ymax and cy >= 16.0 and cz < 20.8:
        tris1.append([[p[0], p[1], p[2]] for p in pts])

poly1 = Poly3DCollection(tris1, alpha=0.8, edgecolor='black', linewidth=0.15, facecolor='lightblue')
ax1.add_collection3d(poly1)
ax1.set_xlim(xmin, xmax)
ax1.set_ylim(16.0, ymax)
ax1.set_zlim(0, 21)
ax1.set_title(f"ORIGINAL M16 Thread ({len(tris1)} tris)")
ax1.view_init(elev=20, azim=45)

# Subplot 2: QEM Decimated M16
ax2 = fig.add_subplot(1, 2, 2, projection='3d')
tris2 = []
for f in stl_qem.Facets:
    pts = f.Points
    cx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3.0
    cy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3.0
    cz = (pts[0][2] + pts[1][2] + pts[2][2]) / 3.0
    if xmin <= cx <= xmax and ymin <= cy <= ymax and cy >= 16.0 and cz < 20.8:
        tris2.append([[p[0], p[1], p[2]] for p in pts])

poly2 = Poly3DCollection(tris2, alpha=0.8, edgecolor='black', linewidth=0.15, facecolor='lightgreen')
ax2.add_collection3d(poly2)
ax2.set_xlim(xmin, xmax)
ax2.set_ylim(16.0, ymax)
ax2.set_zlim(0, 21)
ax2.set_title(f"DECIMATED M16 Thread ({len(tris2)} tris)")
ax2.view_init(elev=20, azim=45)

plt.tight_layout()
plt.savefig('${outPngPath}', dpi=200)
print("Saved QEM M16 comparison to ${outPngPath}")
import sys
sys.exit(0)
`;

  const tmpScriptPath = path.join(os.tmpdir(), `freecad_render_qem_${Date.now()}.py`);
  fs.writeFileSync(tmpScriptPath, pyScript, 'utf-8');

  try {
    const stdout = execSync(`${FREECAD_CMD} "${tmpScriptPath}"`, {
      encoding: 'utf-8',
      timeout: 120000
    });
    console.log(stdout.trim());
  } catch (err: any) {
    console.error('[RenderQEMVerification] Render failed:', err.message);
    throw err;
  } finally {
    try { fs.unlinkSync(tmpScriptPath); } catch {}
  }
}

if (import.meta.main || process.argv[1]?.endsWith('render_qem_verification.ts') || process.argv[1]?.endsWith('render_qem_verification.js')) {
  renderQemVerification({
    origStlPath: process.argv[2],
    decimatedStlPath: process.argv[3],
    outPngPath: process.argv[4]
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
