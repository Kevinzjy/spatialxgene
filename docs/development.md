# Development

Project layout, build and run from source, and where to find design/plan docs.

## Project layout

```
<project root>/
├── README.md              # User-facing usage only
├── pyproject.toml         # Python package: name = "spatialxgene"
├── CHANGELOG.md
├── Makefile               # install, build, dev, launch, test, clean, publish*
├── data/
│   ├── sample/            # Sample data (e.g. STDS0000323)
│   └── references/
├── docs/                  # Design and development docs
│   ├── development.md     # This file
│   ├── master_plan.md
│   ├── implementation_plan.md
│   ├── design_guidelines.md
│   ├── tasks.md
│   └── release_notes_*.md
└── spatialxgene/
    ├── __init__.py        # __version__
    ├── cli.py             # Subcommands: launch, dev, infer, preprocess
    ├── preprocess.py      # QC, HVG, PCA, UMAP, Leiden
    ├── infer_spatial.py   # Infer/add spatial coords
    ├── server/            # FastAPI backend
    └── frontend/          # Vite + React UI (spatial plot, sidebar)
```

## Install and run from source

1. Clone and create venv (recommended: [uv](https://github.com/astral-sh/uv)):

   ```bash
   uv sync
   # or: python -m venv .venv && source .venv/bin/activate && pip install -e .
   ```

2. Install frontend deps and build once:

   ```bash
   cd spatialxgene/frontend && npm install && npm run build && cd ../..
   ```

   Or from project root: `make install` (npm install in frontend), then `make build` (npm run build).

3. Launch:

   ```bash
   spatialxgene launch --data-dir ./data/sample/STDS0000323/preprocessed
   ```

## Development workflow

- **Backend + frontend watch**: run `spatialxgene dev --data-dir <dir>`. One process runs the backend and watches `spatialxgene/frontend/`; saving a file triggers a rebuild. Refresh the browser to see changes. No need to run `npm run build` manually.
- **Backend only**: `uvicorn spatialxgene.server.main:app --reload --host 127.0.0.1 --port 5005` (set data dir before mount or in code).
- **Frontend only**: In `spatialxgene/frontend`, `npm run dev` (Vite dev server proxies `/api` to 5005); run the backend separately on port 5005.

## Makefile targets

| Target | Description |
|--------|-------------|
| `make install` | Sync Python deps + install frontend npm deps |
| `make build` | Build frontend (`npm run build` in frontend) |
| `make dev` | Backend + frontend watch (override: `DATA_DIR`, `HOST`, `PORT`, `DEBUG=1`) |
| `make launch` | Run viewer only |
| `make test` | Python tests (pytest) |
| `make clean` | Remove venv, node_modules, build artifacts |
| `make publish-test` | Build frontend, build wheel, upload to TestPyPI |
| `make publish` | Build frontend, build wheel, upload to PyPI |

Publish targets require the optional `publish` extra (twine); they run `uv sync --extra publish` and `make build-frontend` before building the wheel so the frontend is included.

## Versioning

Bump in sync: `spatialxgene/__init__.py` (`__version__`), `pyproject.toml` (`version`), and `spatialxgene/frontend/package.json` (`version`). Document changes in CHANGELOG and, if needed, in docs.

## Other docs

- [master_plan.md](master_plan.md) — Goals and scope
- [implementation_plan.md](implementation_plan.md) — Implementation order and data design
- [design_guidelines.md](design_guidelines.md) — UI/UX: colors, fonts, interaction
- [tasks.md](tasks.md) — Current task list
- [release_notes_v0.2.md](release_notes_v0.2.md) — v0.2 scope and checklist

Package-level CLI details (all subcommand options): [../spatialxgene/README.md](../spatialxgene/README.md).
