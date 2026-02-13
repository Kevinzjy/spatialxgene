# Spatialxgene - install, run, test, clean
# Override with: make test DATA_DIR=... HOST=... PORT=... or make test DEBUG=1 for console logs

PYTHON   := uv run
FRONTEND := spatialxgene/frontend
DATA_DIR ?= ./data
HOST     ?= 192.168.31.101
PORT     ?= 5005
DEBUG    ?= 0

.PHONY: help install build test clean wheel publish publish-test docker docker-test

help:
	@echo "Spatialxgene Makefile targets:"
	@echo "  make install         - Create venv (uv sync) and install package + frontend deps + build frontend + install spatialxgene"
	@echo "  make build           - Build frontend (required before first launch)"
	@echo "  make test            - Run test data (override: DATA_DIR, HOST, PORT, DEBUG=1)"
	@echo "  make clean           - Remove .venv, node_modules, dist, caches"
	@echo "  make wheel           - Build wheel (output: dist/*.whl)"
	@echo "  make publish-test    - Build wheel and upload to TestPyPI (needs TESTPYPI_USERNAME/TESTPYPI_PASSWORD)"
	@echo "  make publish         - Build wheel and upload to PyPI (needs PYPI_TOKEN)"
	@echo "  make docker          - Build docker images"
	@echo "  make docker-test     - Run test under docker environment"

install:
	@echo "Installing dependencies..."
	uv sync
	@echo "Installing npm packages..."
	cd $(FRONTEND) && npm install
	$(MAKE) build
	@echo "Installing spatialxgene..."
	uv pip install -e .

build:
	@echo "Building frontend..."
	cd $(FRONTEND) && npm run build

test: build
	@echo "Launching spatialxgene..."
	$(PYTHON) spatialxgene launch --data-dir ./data --debug

clean:
	rm -rf .venv
	rm -rf build
	rm -rf $(FRONTEND)/node_modules $(FRONTEND)/dist
	rm -rf spatialxgene/__pycache__ spatialxgene/**/__pycache__
	rm -rf .pytest_cache .ruff_cache .mypy_cache
	rm -f $(FRONTEND)/tsconfig.tsbuildinfo
	@echo "Cleaned. Run 'make install' to reinstall."

# Build wheel and upload to TestPyPI (needs twine from optional deps)
wheel:
	@echo "Building wheel with uv..."
	uv build --wheel

publish-test:
	@echo "Installing extra dependencies for publish..."
	uv sync --extra publish
	$(MAKE) build
	$(MAKE) wheel
	@echo "Uploading to TestPyPI..."
	$(PYTHON) -m twine upload --repository testpypi dist/*

publish:
	@echo "Installing extra dependencies for publish..."
	uv sync --extra publish
	$(MAKE) build
	$(MAKE) wheel
	@echo "Uploading to PyPI..."
	$(PYTHON) -m twine upload --repository pypi dist/*

docker:
	@echo "Building docker images..."
	cd docker && docker compose build
	docker save -o docker/spatialxgene.tar docker-spatialxgene:latest

docker-test:
	@echo "Test docker deployment..."
	docker compose -f docker/docker-compose.nginx-test.yml up --build
