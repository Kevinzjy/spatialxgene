# Spatialxgene - install, run, test, clean
# Override with: make dev DATA_DIR=... HOST=... PORT=... or make dev DEBUG=1 for console logs

PYTHON   := uv run
FRONTEND := spatialxgene/frontend
DATA_DIR ?= ./data
HOST     ?= 192.168.31.101
PORT     ?= 5005
DEBUG    ?= 0

# Publishing config (read credentials from environment)
# - For TestPyPI: export TESTPYPI_USERNAME / TESTPYPI_PASSWORD
# - For PyPI: export PYPI_TOKEN (API token); TWINE_USERNAME is fixed to __token__
TESTPYPI_USERNAME ?= kevinzjy

.PHONY: help install install-frontend build build-frontend dev launch test test-frontend clean infer preprocess publish publish-test

help:
	@echo "Spatialxgene Makefile targets:"
	@echo "  make install         - Create venv (uv sync) and install package + frontend deps"
	@echo "  make install-frontend - Install frontend npm deps only"
	@echo "  make build           - Build frontend (required before first launch)"
	@echo "  make dev             - Backend + frontend watch (override: DATA_DIR, HOST, PORT, DEBUG=1)"
	@echo "  make launch         - Start viewer only (override: DATA_DIR, HOST, PORT, DEBUG=1)"
	@echo "  make test            - Run Python tests (pytest)"
	@echo "  make test-frontend   - Run frontend tests (if configured)"
	@echo "  make clean           - Remove .venv, node_modules, dist, caches"
	@echo "  make infer           - Infer spatial coords (usage: make infer INPUT=path/to/dir_or_file)"
	@echo "  make preprocess      - Preprocess h5ad (usage: make preprocess INPUT=path/to/dir_or_file)"
	@echo "  make publish-test    - Build wheel and upload to TestPyPI (needs TESTPYPI_USERNAME/TESTPYPI_PASSWORD)"
	@echo "  make publish         - Build wheel and upload to PyPI (needs PYPI_TOKEN)"
	@echo ""
	@echo "Examples:"
	@echo "  make dev DATA_DIR=./data/sample/STDS0000235 HOST=192.168.31.101 PORT=5005"
	@echo "  make infer INPUT=./data/sample/STDS0000235"
	@echo "  make preprocess INPUT=./data/sample/STDS0000235"

# Full install: sync venv (installs package), then frontend deps (no build)
install: install-frontend
	@echo "Done. Run 'make build' then 'make launch' or 'make dev'."

# Sync Python deps and install frontend npm deps
install-frontend:
	uv sync
	cd $(FRONTEND) && npm install

# Build frontend (required before first launch)
build: build-frontend

build-frontend:
	cd $(FRONTEND) && npm run build

# Dev: backend + frontend watch; override DATA_DIR / HOST / PORT / DEBUG
dev:
	$(PYTHON) spatialxgene dev --data-dir "$(DATA_DIR)" --host "$(HOST)" --port "$(PORT)" $(if $(filter 1,$(DEBUG)),--debug,)

# Launch viewer only (no watch); use --build to force rebuild frontend
launch:
	$(PYTHON) spatialxgene launch --data-dir "$(DATA_DIR)" --host "$(HOST)" --port "$(PORT)" $(if $(filter 1,$(DEBUG)),--debug,)

# Python tests
test:
	$(PYTHON) pytest -v

# Frontend tests (add script in package.json when needed, e.g. "test": "vitest run")
test-frontend:
	cd $(FRONTEND) && npm run test 2>/dev/null || echo "No frontend test script (add npm run test in $(FRONTEND)/package.json if needed)."

# Infer spatial: make infer INPUT=./data/sample/STDS0000235
infer:
ifndef INPUT
	@echo "Usage: make infer INPUT=<path to .h5ad or directory>"
	@exit 1
endif
	$(PYTHON) spatialxgene infer "$(INPUT)"

# Preprocess: make preprocess INPUT=./data/sample/STDS0000235
preprocess:
ifndef INPUT
	@echo "Usage: make preprocess INPUT=<path to .h5ad or directory>"
	@exit 1
endif
	$(PYTHON) spatialxgene preprocess "$(INPUT)"

# Remove build artifacts and caches
clean:
	rm -rf .venv
	rm -rf $(FRONTEND)/node_modules $(FRONTEND)/dist
	rm -rf spatialxgene/__pycache__ spatialxgene/**/__pycache__
	rm -rf .pytest_cache .ruff_cache .mypy_cache
	rm -f $(FRONTEND)/tsconfig.tsbuildinfo
	@echo "Cleaned. Run 'make install' to reinstall."

# Build wheel and upload to TestPyPI (needs twine from optional deps)
publish-test:
	uv sync --extra publish
	@echo "Building frontend (included in wheel)..."
	$(MAKE) build-frontend
	@echo "Building wheel with uv..."
	uv build --wheel
	@echo "Uploading to TestPyPI..."
	$(PYTHON) -m twine upload --repository testpypi dist/*

# Build wheel and upload to PyPI (needs twine from optional deps)
publish:
	uv sync --extra publish
	@echo "Building frontend (included in wheel)..."
	$(MAKE) build-frontend
	@echo "Building wheel with uv..."
	uv build --wheel
	@echo "Uploading to PyPI..."
	$(PYTHON) -m twine upload --repository pypi dist/*
