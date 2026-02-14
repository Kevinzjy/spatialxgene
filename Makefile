# Spatialxgene - thin wrapper around pixi tasks (~/.pixi/bin/pixi).
# Override: make test DATA_DIR=... HOST=... PORT=... or make test DEBUG=1

PIXI    := $(HOME)/.pixi/bin/pixi
DATA_DIR ?= ./tests/h5ad
HOST     ?= 192.168.31.101
PORT     ?= 5005
DEBUG    ?= 0

export DATA_DIR HOST PORT DEBUG

.PHONY: help install build test clean docker docker-test launch

help:
	@echo "Spatialxgene Makefile (delegates to pixi):"
	@echo "  make install       - pixi run install (npm install, build, pip install -e . --no-deps)"
	@echo "  make build        - pixi run build"
	@echo "  make test         - pixi run test (extract tar → visium2h5ad → preprocess → launch; override HOST, PORT)"
	@echo "  make launch       - pixi run launch"
	@echo "  make clean        - pixi run clean"
	@echo "  make docker       - pixi run docker"
	@echo "  make docker-test  - pixi run docker-test"
	@echo "  List all tasks:   $(PIXI) task list"

install:
	$(PIXI) run install

build:
	$(PIXI) run build

test:
	$(PIXI) run test

launch:
	$(PIXI) run launch

clean:
	$(PIXI) run clean

docker:
	$(PIXI) run docker

docker-test:
	$(PIXI) run docker-test
