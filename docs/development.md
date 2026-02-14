# Development

Project layout, build and run from source, and where to find design/plan docs.

## Environment: pixi + uv

The project uses **[pixi](https://pixi.sh/)** for overall environment management (install at `~/.pixi/bin/pixi` or ensure `pixi` is on PATH). Pixi provides:

- **uv** — Python dependency management (uses `pyproject.toml`; run `uv sync` in the project)
- **nodejs** — Frontend (npm install, npm run build)
- **r-base** — R runtime for future R dependencies

Python packages are still defined in `pyproject.toml`; pixi supplies uv and node so you can run `uv sync` and `npm` without installing them system-wide. Add more R or conda packages in `pixi.toml` as needed.

The **Makefile** is a thin wrapper: each target runs `pixi run <task>`. You can run tasks directly with `pixi run <task>` (e.g. `pixi run install`, `pixi run launch`).

## Project layout

```
<project root>/
├── README.md              # PyPI project page (user-only; no repo/source paths)
├── pyproject.toml         # Python package: name = "spatialxgene"
├── pixi.toml             # Pixi project: deps (uv, nodejs, r-base), tasks
├── CHANGELOG.md
├── Makefile               # Thin wrapper: make X → pixi run X
├── data/
│   ├── sample/            # Sample data (e.g. STDS0000323)
│   └── references/
├── docs/                  # Design and development docs
│   ├── development.md     # This file
│   ├── deployment.md      # Run as systemd service, token, Nginx
│   ├── master_plan.md
│   ├── implementation_plan.md
│   ├── design_guidelines.md
│   └── tasks.md
└── spatialxgene/
    ├── __init__.py        # __version__
    ├── cli.py             # Subcommands: launch, preprocess, visium2h5ad
    ├── preprocess.py      # QC, HVG, PCA, UMAP, Leiden
    ├── visium2h5ad.py     # Visium Space Ranger dir → h5ad (scanpy.read_visium)
    ├── server/            # FastAPI backend
    └── frontend/          # Vite + React UI (spatial plot, sidebar)
```

## Install and run from source

1. Ensure pixi is installed (e.g. `~/.pixi/bin/pixi`). From project root:

   ```bash
   pixi run install
   # or: make install
   ```

   This runs `uv sync`, installs frontend npm deps, builds the frontend, and `uv pip install -e .`.

2. Launch the viewer:

   ```bash
   pixi run launch
   # or: make launch
   ```

   With custom data dir / host / port: `DATA_DIR=/path HOST=0.0.0.0 PORT=5005 pixi run launch`. Optional: `--token zhaoslab` (default); use `--token ""` to disable. See [deployment.md](deployment.md) for production deployment.

## Development workflow

- **Backend only**: `uv run uvicorn spatialxgene.server.main:app --reload --host 127.0.0.1 --port 5005` (from a pixi shell or after `uv sync`).
- **Frontend only**: In `spatialxgene/frontend`, `npm run dev` (Vite proxies `/api` to 5005); run the backend separately on port 5005.

## Pixi tasks / Makefile targets

| Task | Description |
|------|-------------|
| `pixi run install` / `make install` | uv sync, npm install, build frontend, pip install -e . |
| `pixi run build` / `make build` | Build frontend only |
| `pixi run launch` / `make launch` | Run viewer (env: DATA_DIR, HOST, PORT) |
| `pixi run test` / `make test` | Launch viewer with --debug (same env overrides) |
| `pixi run clean` / `make clean` | Remove .venv, node_modules, dist, caches |
| `pixi run wheel` / `make wheel` | Build wheel (depends on build) |
| `pixi run publish-test` / `make publish-test` | Build wheel, upload to TestPyPI |
| `pixi run publish` / `make publish` | Build wheel, upload to PyPI |
| `pixi run docker` / `make docker` | Build docker image, save to docker/spatialxgene.tar |
| `pixi run docker-test` / `make docker-test` | Run nginx + spatialxgene for subpath test |

List all tasks: `pixi task list`. Publish tasks install the `publish` extra (twine) and run the wheel task first.

## Versioning

Bump in sync: `spatialxgene/__init__.py` (`__version__`), `pyproject.toml` (`version`), and `spatialxgene/frontend/package.json` (`version`). Document changes in CHANGELOG and, if needed, in docs.

## Other docs

- [deployment.md](deployment.md) — Run as a systemd service on Linux
- [master_plan.md](master_plan.md) — Goals and scope
- [implementation_plan.md](implementation_plan.md) — Implementation order and data design
- [design_guidelines.md](design_guidelines.md) — UI/UX: colors, fonts, interaction
- [tasks.md](tasks.md) — Current task list

Release history and version notes: root [CHANGELOG.md](../CHANGELOG.md). Package-level CLI details (all subcommand options): [../spatialxgene/README.md](../spatialxgene/README.md).
