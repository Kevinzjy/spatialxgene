# Development

Project layout, build and run from source, and where to find design/plan docs.

## Environment: pixi (Python from conda-forge)

The project uses **[pixi](https://pixi.sh/)** for environment management (install at `~/.pixi/bin/pixi` or ensure `pixi` is on PATH). Pixi provides:

- **Python and Python packages** — From conda-forge (numpy, scanpy, anndata, fastapi, uvicorn, etc.); versions are pinned in `pixi.toml`.
- **nodejs** — Frontend (npm install, npm run build)
- **r-base** — R runtime for future R dependencies

Run `pixi run launch` or `pixi run spatialxgene launch`; the install task runs `pip install -e . --no-deps` so the package uses pixi-installed deps. Add more R or conda packages in `pixi.toml` as needed.

The **Makefile** is a thin wrapper: each target runs `pixi run <task>`. You can run tasks directly with `pixi run <task>` (e.g. `pixi run install`, `pixi run launch`).

## Project layout

```
<project root>/
├── README.md
├── pyproject.toml         # Python package metadata; pip install -e . --no-deps
├── pixi.toml              # Pixi: deps (python, nodejs, r-base), tasks
├── CHANGELOG.md
├── Makefile               # Thin wrapper: make X → pixi run X
├── tests/                 # Test data and default launch data dir
│   ├── HCC1R.tar          # Visium sample (tar); test task extracts and runs pipeline
│   └── h5ad/              # Default DATA_DIR for launch; put preprocessed h5ad here
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

   This installs pixi deps, builds the frontend, and `pip install -e . --no-deps`.

2. Launch the viewer:

   ```bash
   pixi run launch
   # or: make launch
   ```

   Default data dir is `./tests/h5ad` (see pixi.toml). Override: `DATA_DIR=/path HOST=0.0.0.0 PORT=5005 pixi run launch`. Optional: `--token zhaoslab` (default); use `--token ""` to disable. See [deployment.md](deployment.md) for production deployment.

## Development workflow

- **Backend only**: `pixi run python -m uvicorn spatialxgene.server.main:app --reload --host 127.0.0.1 --port 5005`.
- **Frontend only**: In `spatialxgene/frontend`, `npm run dev` (Vite proxies `/api` to 5005); run the backend separately on port 5005.

## Pixi tasks / Makefile targets

| Task | Description |
|------|-------------|
| `pixi run install` / `make install` | Pixi install, npm install, build frontend, pip install -e . --no-deps |
| `pixi run build` / `make build` | Build frontend only |
| `pixi run launch` / `make launch` | Run viewer; default DATA_DIR=./tests/h5ad (env: DATA_DIR, HOST, PORT) |
| `pixi run test` / `make test` | Extract tests/HCC1R.tar → visium2h5ad → preprocess → launch (data-dir ./tests); on exit removes generated h5ad. Override HOST/PORT. |
| `pixi run clean` / `make clean` | Remove .venv, node_modules, dist, caches |
| `pixi run docker` / `make docker` | Build docker image, save to docker/spatialxgene.tar |
| `pixi run docker-test` / `make docker-test` | Run nginx + spatialxgene for subpath test |

List all tasks: `pixi task list`.

## Test data

- **tests/HCC1R.tar**: Visium Space Ranger output (tar). `pixi run test` extracts it to `tests/HCC1R`, runs `spatialxgene visium2h5ad` and `spatialxgene preprocess`, then launches the viewer with `--data-dir ./tests`. When you stop the server, the task removes the generated `tests/HCC1R.h5ad` and `tests/HCC1R_processed.h5ad`.
- **tests/h5ad/**: Default data directory for `pixi run launch`. Place preprocessed h5ad files here for daily use. Docker compose mounts this as `/data` in the container.

## Versioning

Bump in sync: `spatialxgene/__init__.py` (`__version__`), `pyproject.toml` (`version`), and `spatialxgene/frontend/package.json` (`version`). Document changes in CHANGELOG and, if needed, in docs.

## Other docs

- [deployment.md](deployment.md) — Run as a systemd service on Linux
- [master_plan.md](master_plan.md) — Goals and scope
- [implementation_plan.md](implementation_plan.md) — Implementation order and data design
- [design_guidelines.md](design_guidelines.md) — UI/UX: colors, fonts, interaction
- [tasks.md](tasks.md) — Current task list

Release history and version notes: root [CHANGELOG.md](../CHANGELOG.md). Package-level CLI details (all subcommand options): [../spatialxgene/README.md](../spatialxgene/README.md).
