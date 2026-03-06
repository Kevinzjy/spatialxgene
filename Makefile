# Spatialxgene - thin wrapper around pixi tasks (~/.pixi/bin/pixi).
# Override: make test DATA_DIR=... HOST=... PORT=... or make test DEBUG=1

PIXI    := $(HOME)/.pixi/bin/pixi
DATA_DIR ?= ./tests/h5ad
HOST     ?= 0.0.0.0
PORT     ?= 5005
DEBUG    ?= 0
PROJECT  ?= spatialxgene

export DATA_DIR HOST PORT DEBUG

.PHONY: help install build test test-e2e pytest clean global docker docker-save singularity-build singularity-run docker-test launch whl release

help:
	@echo "Spatialxgene Makefile (delegates to pixi):"
	@echo "  make install      - pixi run install (npm install, build, pip install -e . --no-deps)"
	@echo "  make build        - pixi run build (Frontend npm build)"
	@echo "  make test         - pixi run test (integration: extract tar → conversion → preprocess → launch)"
	@echo "  make test-e2e     - pixi run test-e2e (frontend Playwright E2E tests)"
	@echo "  make pytest       - pixi run pytest (backend unit tests)"
	@echo "  make launch       - pixi run launch"
	@echo "  make clean        - pixi run clean"
	@echo "  make global       - pixi global install --path ./"
	@echo "  make whl          - Build Python wheel to dist/"
	@echo "  make docker       - Build Docker image 'spatialxgene:latest'"
	@echo "  make docker-save  - Build and save versioned Docker image to 'docker/spatialxgene-V.tar'"
	@echo "  make singularity-build - Build versioned SIF from Docker tar (for HPC)"
	@echo "  make release      - Full pipeline: build whl, versioned docker tar, and singularity SIF"
	@echo "  make docker-test  - pixi run docker-test (Nginx subpath test)"
	@echo "  List all tasks:   $(PIXI) task list"

install:
	$(PIXI) run install

build:
	$(PIXI) run build

test:
	$(PIXI) run test

test-e2e:
	$(PIXI) run test-e2e

pytest:
	$(PIXI) run pytest

launch:
	$(PIXI) run launch

clean:
	$(PIXI) run clean

global: install
	$(PIXI) global uninstall $(PROJECT) && $(PIXI) global install --path ./

whl:
	$(PIXI) run whl

docker:
	$(PIXI) run docker

docker-save:
	$(PIXI) run docker-save

singularity-build:
	$(PIXI) run singularity-build

singularity-run:
	$(PIXI) run singularity-run

release:
	$(PIXI) run release

docker-test:
	$(PIXI) run docker-test
