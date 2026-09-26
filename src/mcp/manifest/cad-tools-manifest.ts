// ==============================================================================
// src/mcp/manifest/cad-tools-manifest.ts — Tool Manifests & Validation Schema
// ==============================================================================

import * as path from 'path';
import * as fs from 'fs';

export interface McpToolDeclaration {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, { type: string; description: string }>;
    required: string[];
  };
}

export const TOOLS_MANIFEST: McpToolDeclaration[] = [
  {
    name: 'cad_analyze_stl',
    description: 'Inspects a 3D STL mesh: returns triangle count, bounding dimensions, watertightness, and shell decomposition.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute or relative path to the STL file' }
      },
      required: ['filePath']
    }
  },
  {
    name: 'cad_detect_threads',
    description: 'Scans an STL mesh for engineered threads (internal tapped holes and external studs), detecting pitch, diameter, and ISO designations.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the STL model' }
      },
      required: ['filePath']
    }
  },
  {
    name: 'cad_verify_rsvs',
    description: 'Runs Reality Simulation & Verification Suite (RSVS) against an STL file, calculating Hausdorff distance, volume bias, and gate status.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to the STL file' },
        outDir: { type: 'string', description: 'Output directory for verification report' }
      },
      required: ['filePath']
    }
  },
  {
    name: 'cad_convert_to_step',
    description: 'Converts an STL mesh into an ISO 10303-21 STEP AP242 solid file and two-tier JSON metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Path to input STL file' },
        outDir: { type: 'string', description: 'Destination folder for STEP and JSON' }
      },
      required: ['filePath', 'outDir']
    }
  }
];

export interface ValidatedToolParams {
  filePath: string;
  outDir: string;
  baseName: string;
}

/**
 * Fast synchronous parameter validation ensuring correct file paths and structure.
 */
export async function validateToolParams(name: string, args: any): Promise<ValidatedToolParams> {
  if (!args || typeof args !== 'object') {
    throw new Error('Invalid params: arguments must be an object');
  }
  if (typeof args.filePath !== 'string' || args.filePath.trim().length === 0) {
    throw new Error('Invalid params: filePath must be a non-empty string');
  }

  const filePath = path.resolve(args.filePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stat = await fs.promises.stat(filePath);
  if (!stat.isFile()) {
    throw new Error(`Expected a 3D STL file, but specified path is a directory: ${filePath}`);
  }

  const baseName = path.basename(filePath, path.extname(filePath));
  const outDir = path.resolve(args.outDir || path.dirname(filePath));

  return { filePath, outDir, baseName };
}
