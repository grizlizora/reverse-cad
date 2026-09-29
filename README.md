<div align="center">

# ⚙️ ReverseCAD: Industrial-Grade STL ➔ STEP AP242 + CAD Features Engine

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8%20Pure-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Runtime](https://img.shields.io/badge/Runtime-Node.js%2020%2B%20%7C%20Bun%201.1%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![STEP AP242](https://img.shields.io/badge/STEP-ISO%2010303--21%20AP242-blue?style=for-the-badge&logo=autodesk&logoColor=white)]()
[![Topology](https://img.shields.io/badge/B--Rep%20Topology-100%25%20Watertight%20Solid-brightgreen?style=for-the-badge&logo=checkmarx&logoColor=white)]()
[![Modularity](https://img.shields.io/badge/Architecture-%3C%20190%20Lines%20%2F%20Module-orange?style=for-the-badge&logo=clean-code&logoColor=white)]()
[![Zero-GC](https://img.shields.io/badge/Hot%20Paths-Zero--Heap%20SoA-purple?style=for-the-badge&logo=speedtest&logoColor=white)]()
[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Linux%20%7C%20Windows-lightgrey.svg?style=for-the-badge&logo=linux&logoColor=white)]()
[![Architecture](https://img.shields.io/badge/Arch-ARM64%20%7C%20x86__64-blue?style=for-the-badge&logo=arm&logoColor=white)]()
[![MCP Server](https://img.shields.io/badge/MCP-Protocol%202024--11--05-00D2BA?style=for-the-badge&logo=anthropic&logoColor=white)](https://modelcontextprotocol.io)
[![Community License](https://img.shields.io/badge/Community%20License-PolyForm%20Noncommercial-blue?style=for-the-badge&logo=open-source-initiative&logoColor=white)](LICENSE)
[![Commercial License](https://img.shields.io/badge/Commercial%20License-%2410%2C000%2Fyear-gold?style=for-the-badge&logo=stripe&logoColor=white)](COMMERCIAL.md)

**High-performance, 100% pure TypeScript reverse-engineering engine and MCP server that deterministically transforms raw `.stl` polygon meshes into clean, production-grade solid B-Rep models (STEP AP242 / ISO 10303-21) and dense engineering CAD Features JSON in seconds.**

[🚀 Quick Start](#-quick-start--cli-usage) • [✨ Key Capabilities](#-key-engineering-capabilities) • [📁 Output Artifacts](#-output-artifacts) • [🏗️ Architecture](docs/ARCHITECTURE.md) • [🤖 MCP Server](#-model-context-protocol-mcp-server) • [🧪 Testing](#-test-suite--quality-verification) • [🏢 Commercial Licensing](COMMERCIAL.md) • [👨‍💻 Author](#-author--collaboration)

</div>

---

## ✨ Key Engineering Capabilities

| Engineering Feature | Technology & Mathematical Method | Representation in STEP & JSON |
|---|---|---|
| 🧊 **Watertight Solid B-Rep Guarantee** | Euler-Poincaré invariant ($\chi = 2 - 2g$), symmetric half-edge pairing, 64-bit quantized topological vertex pool. | **STEP:** `MANIFOLD_SOLID_BREP` with a single closed `CLOSED_SHELL`. Strictly 0 open edges, 0 non-manifold edges. |
| ⚖️ **Exact Gauss-Mirtich Mass & 3D Inertia** | Analytical divergence theorem integration with exact `/ 120.0` divisor. Volume, surface area, center of mass, and full $3 \times 3$ inertia tensor. | **JSON:** `volumeMm3`, `centerOfMass`, `inertiaTensor` ($I_{xx}, I_{yy}, I_{zz}, I_{xy}, I_{yz}, I_{zx}$ with $I_{xy}=0$ on symmetric bodies). |
| 🧹 **Boundary Unification (No Extra Lines)** | Coplanar half-edge cancellation, Jordan cycle extraction, RDP collinear vertex reduction ($10^{-5}$ mm). | **STEP:** Clean unified `ADVANCED_FACE` with single outer bound and inner loops. Zero internal wireframe lines. |
| 🔄 **2D Gauss Area Angle Sweep Triangulator** | Monotonic cyclic angle sweep (`loop-band-triangulator.ts`) determining CW/CCW orientation via 2D Shoelace area in transverse normal plane. | Guarantees 100% topological band closure between top and bottom loops without butterfly self-intersections. |
| 📐 **Seamless C0 Profile Fitting** | Algebraic least-squares circle fitting (Kåsa/Pratt), seamless tangent line-to-arc transitions without edge duplication, $2\pi$ circle closure. | **STEP:** Precise `CIRCLE` and `LINE` geometry with C0 profile boundary snapping (`profile-loop-snapper.ts`). |
| 🔩 **ISO Metric Threads (M2–M24)** | Catalog matching, coaxial cylinder RANSAC, pitch $P$ and tap drill diameter extraction. Mode selectable (`auto`, `physical`, `semantic`). | **STEP:** Optional cosmetic helical geometry or analytical core.<br />**JSON:** `spec: "M6x1", pitchMm: 1.0, isInternal: true`. |
| 🛡️ **Scale-Invariant & Datum Shielding** | Dynamic scale normalization $D_{\text{bbox}}$, Tier E protection for micro-chamfers, strict datum plane locks (`datumA && datumB`). | Prevents decimation erosion on 45° entrance chamfers and critical reference datums. |
| 🕳️ **Internal Cavities & Channels** | Signed volume divergence theorem integration per closed manifold shell ($V < 0$). | Internal cooling lines and cavities remain 100% hollow during slicing and CAD import. |
| ⚡ **DWRR Concurrency & Zero-GC Profiling** | Deficit Weighted Round-Robin fair-share scheduling, dynamic CPU core/RAM scaling, Structure-of-Arrays (SoA) binary heaps. | Eliminates head-of-line blocking on 16-core systems. Heap delta: 0.00 MB during hot loops. |
| 🔬 **RSVS 5-Gate Reality Simulation** | Strict verification: Hausdorff $H_{99} \le 0.05$ mm, $H_{\max}$ via $O(N)$ QuickSelect, RMSE, mass drift, native B-Rep topological validation. | Pre-manufacturing geometric sign-off before sending code to CNC mills or 3D printers. |

---

## 📁 Output Artifacts

Running ReverseCAD produces up to 5 synchronized manufacturing artifacts plus a streaming audit manifest:

```
output_directory/
├── 🧊 [1] Model.step                         <- 3D CAD Solid B-Rep (ISO 10303-21 AP242 / AP214)
├── ⚡ [2] Model.cad_features.summary.json    <- High-density AI JSON (<1200 tokens)
├── 🔬 [3] Model.cad_features.topology.json   <- Deep B-Rep topological geometry dump
├── 📊 [4] Model.verification_report.json     <- RSVS 5-Gate quality & accuracy report
├── 🌈 [5] Model.heatmap.glb                  <- 3D interactive color deviation heatmap
└── 📜 conversion_manifest.ndjson             <- Real-time streaming pipeline audit log
```

---

## 🚀 Quick Start & CLI Usage

### 1. Requirements & Installation
* **Node.js** `>= 20.0.0` or **Bun** `>= 1.1.0`
* **macOS** (Apple Silicon ARM64 / Intel x64), **Linux** (x86_64 / aarch64), or **Windows**

```bash
# Clone the repository
git clone https://github.com/grizlizora/reverse-cad.git
cd reverse-cad

# Install dependencies and compile
npm install
npm run build

# Make the driver executable
chmod +x ./convert.sh
```

### 2. Basic Conversions
```bash
# Convert STL to production solid STEP AP242 with default outputs
./convert.sh model.stl

# Or using Bun directly
bun run src/cli/index.ts model.stl
```

### 3. Selective Artifact Emission (`--emit`)
Control exactly which files are generated to minimize I/O and optimize throughput:

```bash
# 1. Solid-Only: Generate ONLY the 3D STEP solid (fastest, zero JSON)
./convert.sh part.stl --emit step          # (or: ./convert.sh part.stl --step-only)

# 2. AI Package: STEP solid + compact AI engineering summary JSON
./convert.sh part.stl --emit step,summary

# 3. Full Engineering Audit: All 5 artifacts including GLB 3D deviation heatmap
./convert.sh part.stl --emit all

# 4. JSON-Only: Skip STEP generation entirely, extract CAD features in milliseconds
./convert.sh part.stl --json-only
```

### 4. Advanced CLI Options

| Flag | Values | Description |
|---|---|---|
| `-t, --threads` | `<N>` | Number of parallel worker threads (`0` = auto CPU core count minus 1). |
| `-q, --quality` | `high` \| `fast` | Processing preset: `high` (full RANSAC + QEM) or `fast` (quick decimation). |
| `-o, --out-dir` | `<path>` | Custom destination directory for generated artifacts (default: `./output`). |
| `-i, --interactive` | — | Launch interactive terminal wizard to select outputs and options. |
| `-y, --yes, --default` | — | Non-interactive mode: accept defaults without prompting (ideal for CI/CD). |
| `--emit` | `formats` | Comma-separated outputs: `step`, `summary`, `topology`, `report`, `heatmap`, `all`, `minimal`. |
| `--representation` | `auto` \| `brep` \| `tessellated` | STEP geometry mode: analytical `brep`, faceted `tessellated`, or adaptive `auto`. |
| `--thread-mode` | `auto` \| `physical` \| `semantic` | Metric thread mode: physical modeled threads, semantic annotation, or auto. |
| `-m, --material` | `<preset>` | Assign material density: `steel`, `aluminum`, `pla`, `petg`, `abs`, `glass`. |
| `--heatmap` | `failed-only` \| `always` \| `none` | Control 3D GLB deviation heatmap generation. |
| `--align-viewer` | — | Auto-align 6 canonical views (Top/Bottom/Front/Back) for CAD viewers (default). |
| `--keep-orientation` | — | Preserve original coordinates without CAD axis reorientation. |
| `--verify` / `--no-verify` | — | Enable or disable the RSVS 5-Gate reality simulation verification suite. |
| `--mcp` | — | Start as a Stdio MCP Server for AI coding assistants. |
| `--test` | — | Run embedded RSVS regression test suite and mutation tests. |
| `-v, --verbose` | — | Enable verbose debugging logs. |

---

## 🤖 Model Context Protocol (MCP) Server

ReverseCAD implements the official [Model Context Protocol (MCP)](https://modelcontextprotocol.io) specification (Stdio transport). AI assistants (*Cursor, Claude Desktop, Antigravity*) can analyze, query, and convert 3D CAD geometries directly within the chat workflow.

### Configuration
Add ReverseCAD to your AI assistant's config file (e.g., `claude_desktop_config.json` or `.gemini/antigravity/mcp/`):

```json
{
  "mcpServers": {
    "reverse-cad": {
      "command": "node",
      "args": ["/absolute/path/to/reverse-cad/dist/mcp/mcp-server.js"]
    }
  }
}
```

*Or with Bun:*
```json
{
  "mcpServers": {
    "reverse-cad": {
      "command": "bun",
      "args": ["/absolute/path/to/reverse-cad/src/mcp/mcp-server.ts"]
    }
  }
}
```

### Available MCP Tools

| MCP Tool Name | Input Parameters | Output & Purpose |
|---|---|---|
| `cad_analyze_stl` | `filePath`, `threshold?` | Analyzes mesh quality, triangle count, watertightness, bounding box, volume, and surface area. |
| `cad_detect_threads` | `filePath` | Detects ISO metric threads (M2–M24), nominal diameters, pitches, and tap drill specifications. |
| `cad_verify_rsvs` | `filePath`, `outDir?` | Runs RSVS 5-Gate reality simulation, returning Hausdorff $H_{99}$, RMSE, and Euler characteristic. |
| `cad_convert_to_step` | `filePath`, `outDir?`, `options?` | Converts STL to solid STEP AP242 and emits CAD features JSON artifacts. |

---

## 🏗️ Clean Code & Strict Modularity Architecture

ReverseCAD enforces an uncompromising architectural policy:
* **Strict Line Limit (< 190 lines):** Every single module across all **355+ TypeScript files** in `src/` is strictly under 190 lines of code. There are zero "God-objects".
* **Single Responsibility Principle (SRP):** Complex algorithms (e.g. QEM decimation, RANSAC segmentation, B-Rep synthesis) are decoupled into focused, testable micro-modules.
* **Acyclic Dependency Graph (DAG):** Circular dependencies are strictly eliminated through dependency inversion and dedicated coordinator facades.
* **Zero-Allocation Hot Paths:** FPU-heavy geometric loops operate entirely on flat `TypedArray` buffers (`Float32Array`, `Float64Array`, `Int32Array`, `Uint8Array`) and Structure-of-Arrays (SoA) binary heaps.

Detailed architectural diagrams, mathematical formulations, and concurrency designs are available in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## 🧪 Test Suite & Quality Verification

ReverseCAD features an extensive, multi-tier automated test suite verifying mathematical precision, topological closure, concurrency, and real-world CAD benchmarks.

```bash
# Run the complete test suite in Bun
bun run src/test/run-tests.ts

# Or run the compiled test suite in Node.js
npm test
```

### Embedded Test Suites:
1. **Wave 8–10 Math & Concurrency Verification:**
   - Exact Gauss-Mirtich inertia tensor ($120.0$ divisor, $I_{xy} = 0.0$ on unit cube).
   - 2D Gauss polygon area loop winding direction (Shoelace formula).
   - Seamless line-to-arc profile continuity without edge duplication.
   - Strict CLI enum argument validation.
   - Decoupled spatial grid and deterministic PRNG sampling.
2. **Boundary Unifier & Feature Protection (`test-boundary-unifier.ts`):**
   - 8/8 tests verifying coplanar face unification, collinear vertex reduction, and hole loop extraction.
3. **Crease Preservation (`test-crease-preservation.ts`):**
   - In-memory decimation test preserving 90° sharp edges and 45° chamfers with $H_{\max} = 0.0000$ mm.
4. **Watertight Solid B-Rep Hole (`test-watertight-solid-hole.ts`):**
   - Verifies 100% closed solid cube with cylindrical hole (Faces = 18, OpenEdges = 0, NonManifold = 0).
5. **RSVS Reality Simulation Benchmarks (Gates G0–G4):**
   - `benchmark_prismatic_m6.stl` (M6 metric thread detection).
   - `benchmark_internal_labyrinth.stl` (Zero-voxel internal cavity detection).
   - `benchmark_pip_hinge.stl` (Print-in-Place clearance detection).
   - `benchmark_organic_saddle.stl` (Hyperbolic paraboloid freeform reconstruction).
   - Combinatorial Matrix Scanner & Zero-GC Memory Leak Audit.

---

## 📄 Licensing & Commercial Options

ReverseCAD uses a transparent **Dual-Licensing Model**:

* 🟢 **Community Edition ([PolyForm Noncommercial 1.0.0](LICENSE)):**  
  100% Free for individuals, students, makers, hobbyists, and non-commercial educational/academic research.
* 🏢 **Commercial & Enterprise Edition ($10,000 USD / year):**  
  Required for all for-profit enterprises, manufacturing bureaus, 3D print farms, CNC machine shops, closed-source SaaS products, and commercial applications. Includes legal indemnification, enterprise support, and SLA. See [COMMERCIAL.md](COMMERCIAL.md).

---

## 👨‍💻 Author & Collaboration

Designed and engineered with passion by **Roman ([@grizlizora](https://t.me/grizlizora))** — Specialist in High-Performance Computational Geometry, B-Rep CAD Kernels, Multithreaded Systems, and AI Agent Integrations.

* 💬 **Telegram:** [@grizlizora](https://t.me/grizlizora)
* 🐙 **GitHub:** [@grizlizora](https://github.com/grizlizora)
* 📧 **Email:** [roma.vaida66@gmail.com](mailto:roma.vaida66@gmail.com)
* 💼 **LinkedIn:** [Roman Vaida](https://www.linkedin.com/in/roman-vaida-4873a6287)
