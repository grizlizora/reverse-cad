// ==============================================================================
// src/kernel/step/validation/external/freecad-occ-bridge.ts — Cross-Platform FreeCAD OCC Bridge
// ==============================================================================

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { StepValidationReport } from '../types.js';

export class FreecadOccBridge {
  private static resolveBinary(): string | null {
    // 0. Environment variable override
    if (process.env.FREECAD_BIN && fs.existsSync(process.env.FREECAD_BIN)) {
      return process.env.FREECAD_BIN;
    }

    // 1. macOS bundle & Homebrew paths (ARM64 & x86_64)
    const macPaths = [
      '/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd',
      '/opt/homebrew/bin/freecadcmd',
      '/usr/local/bin/freecadcmd'
    ];
    for (const p of macPaths) {
      if (fs.existsSync(p)) return p;
    }

    // 2. Linux paths (Fedora, Debian, Ubuntu, Flatpak & Snap)
    const linuxPaths = [
      '/usr/bin/freecadcmd',
      '/usr/local/bin/freecadcmd',
      '/usr/bin/freecad',
      '/app/bin/FreeCADCmd',
      '/snap/bin/freecad.cmd',
      '/snap/bin/freecad'
    ];
    for (const p of linuxPaths) {
      if (fs.existsSync(p)) return p;
    }

    // 3. Windows paths (including versioned FreeCAD 1.0 / 0.21 installs)
    if (process.platform === 'win32') {
      const winBases = [
        process.env['ProgramFiles'] || 'C:\\Program Files',
        process.env['LOCALAPPDATA'] ? path.join(process.env['LOCALAPPDATA'], 'Programs') : ''
      ].filter(Boolean);

      for (const base of winBases) {
        const direct = path.join(base, 'FreeCAD', 'bin', 'freecadcmd.exe');
        if (fs.existsSync(direct)) return direct;
        try {
          if (fs.existsSync(base)) {
            const entries = fs.readdirSync(base);
            for (const entry of entries) {
              if (entry.startsWith('FreeCAD')) {
                const candidate = path.join(base, entry, 'bin', 'freecadcmd.exe');
                if (fs.existsSync(candidate)) return candidate;
              }
            }
          }
        } catch {}
      }
    }

    return null;
  }

  public static validate(
    filePath: string,
    timeoutMs: number = 30000
  ): StepValidationReport['freecadConfirmation'] {
    const freecadBin = FreecadOccBridge.resolveBinary();
    if (!freecadBin) {
      return {
        available: false,
        readTimeSec: 0,
        faces: 0,
        solids: 0,
        shells: 0,
        isClosed: false,
        isValid: false
      };
    }

    const scriptPath = path.join(os.tmpdir(), `freecad_val_${Date.now()}_${Math.floor(Math.random() * 10000)}.py`);
    const escapedFilePath = JSON.stringify(filePath);
    const pyScript = `import Part, time
t0 = time.time()
s = Part.Shape()
s.read(${escapedFilePath})
t1 = time.time()
print(f"FC_RES|{t1-t0:.4f}|{len(s.Faces)}|{len(s.Solids)}|{len(s.Shells)}|{s.isClosed()}|{s.isValid()}")
`;

    try {
      fs.writeFileSync(scriptPath, pyScript, 'utf-8');
      const out = execFileSync(freecadBin, [scriptPath], { encoding: 'utf-8', timeout: timeoutMs });
      const m = out.match(/FC_RES\|([0-9.]+)\|([0-9]+)\|([0-9]+)\|([0-9]+)\|(True|False)\|(True|False)/);
      if (m) {
        return {
          available: true,
          readTimeSec: parseFloat(m[1]),
          faces: parseInt(m[2], 10),
          solids: parseInt(m[3], 10),
          shells: parseInt(m[4], 10),
          isClosed: m[5] === 'True',
          isValid: m[6] === 'True'
        };
      }
    } catch {
      // Fallback if freecadcmd timed out or errored
    } finally {
      try {
        if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
      } catch {}
    }

    return {
      available: true,
      readTimeSec: 0,
      faces: 0,
      solids: 0,
      shells: 0,
      isClosed: false,
      isValid: false
    };
  }
}
