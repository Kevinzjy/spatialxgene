# Docker deployment for Spatialxgene

Build and run with Docker Compose from the **project root**:

```bash
docker compose -f docker/docker-compose.yml up -d
```

- **Data**: Default volume `./data` on the host is mounted at `/data` in the container. Put your preprocessed h5ad files in `./data/` (or change the `volumes` path in `docker-compose.yml`).
- **Port**: App listens on 5005 inside the container; default mapping is `5005:5005`. Change the left side to bind another host port.
- **Token**: Default auth token is `zhaoslab`. Override by uncommenting and editing the `command` in `docker-compose.yml`:
  - `command: ["--token", "your-secret"]` — use your own token
  - `command: ["--token", ""]` — disable token (open access)

## Subpath behind nginx

If you proxy at a path like `/spatialxgene/`, pass the same base to the app:

```yaml
command: ["--api-base", "spatialxgene", "--token", "zhaoslab"]
```

Adjust `--api-base` to match your nginx `location` path (without leading/trailing slashes).

## Build only (no compose)

From project root:

```bash
docker build -f docker/Dockerfile -t spatialxgene .
docker run -p 5005:5005 -v "$(pwd)/data:/data" spatialxgene
```

## See also

- [../docs/deployment.md](../docs/deployment.md) — Full deployment guide (Docker Compose + systemd).

## Remote deployment

```bash
# Save images
make docker 
docker save -o docker/spatialxgene.tar docker-spatialxgene:latest

# Load images
docker load -i spatialxgene.tar
git clone <repo>
cd docker
docker compose up
```
