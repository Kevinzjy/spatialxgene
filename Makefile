# Spatialxgene - thin wrapper around pixi tasks (~/.pixi/bin/pixi).
# Override: make test DATA_DIR=... HOST=... PORT=... or make test DEBUG=1

PIXI    := $(HOME)/.pixi/bin/pixi
DATA_DIR ?= ./tests/h5ad
HOST     ?= 0.0.0.0
PORT     ?= 5005
DEBUG    ?= 0
PROJECT  ?= spatialxgene

export DATA_DIR HOST PORT DEBUG

.PHONY: help install build test test-e2e pytest clean global docker docker-test launch

help:
	@echo "Spatialxgene Makefile (delegates to pixi):"
	@echo "  make install      - pixi run install (npm install, build, pip install -e . --no-deps)"
	@echo "  make build        - pixi run build"
	@echo "  make test         - pixi run test (integration: extract tar → conversion → preprocess → launch)"
	@echo "  make test-e2e     - pixi run test-e2e (frontend Playwright E2E tests)"
	@echo "  make pytest       - pixi run pytest (backend unit tests)"
	@echo "  make launch       - pixi run launch"
	@echo "  make clean        - pixi run clean"
	@echo "  make global       - pixi global install --path ./"
	@echo "  make docker       - pixi run docker"
	@echo "  make docker-test  - pixi run docker-test"
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

docker:
	$(PIXI) run docker

docker-test:
	$(PIXI) run docker-test
