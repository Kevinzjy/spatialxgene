# Deployment

How to run Spatialxgene as a long-running service: **Docker Compose** (recommended for permanent web services) or **Singularity** (recommended for HPC/clusters with old glibc like CentOS 7).

---

## Singularity (HPC & Old glibc Compatibility)

Singularity (Apptainer) is the best solution for running Spatialxgene on **HPC clusters** or servers with old glibc (e.g., **CentOS 7**). It encapsulates the entire environment into a single `.sif` file, bypassing host system library constraints.

### 1. Build SIF Image

Build the Singularity Image Format (SIF) file on a machine that has Singularity installed:

```bash
# First, build and save the Docker image to a tar archive
make docker-save
# Then, build the SIF from the tar archive
make singularity-build
# This produces docker/spatialxgene.sif
```

### 2. Run on Server

Copy `docker/spatialxgene.sif` to your server and run it. Use `--bind` to mount your data directory to `/data` inside the container.

```bash
singularity run --bind /path/to/h5ad:/data docker/spatialxgene.sif --token YOUR_TOKEN
```

- **Data**: Mount host data to `/data`.
- **Token**: Set access token explicitly if you want auth; default is disabled.
- **Port/Host**: Use `--port` and `--host` to override defaults.

---

## Docker Compose

Recommended for permanent web services, especially when using reverse proxies like Nginx.

```bash
docker compose -f docker/docker-compose.yml up -d
```

- **Data**: Default volume is `./tests/h5ad` → `/data` in the container. Edit `docker/docker-compose.yml` to use your actual path.
- **Token**: Set `SPATIALXGENE_TOKEN` or override `command` if you want auth; default is disabled.
- **Port**: Default `5005`.

See [docker/README.md](../docker/README.md) for more details.

---

## systemd (Linux)

### Prerequisites

- **Linux** with systemd (e.g. Debian, Ubuntu, RHEL, Rocky).
- **Python 3.9+** and [pixi](https://pixi.sh/) (manifest: <https://pixi.prefix.dev/latest/reference/pixi_manifest>) or `pip` if not using pixi.
- A **data directory** containing preprocessed h5ad files (or empty; you can add data later).
- A **non-root user** to run the service (e.g. `www-data`, `spatialxgene`, or your app user).

## Install Spatialxgene

From source (e.g. in `/opt/spatialxgene`) with pixi:

```bash
cd /opt/spatialxgene
pixi run install
# or: pixi install && cd spatialxgene/frontend && npm install && npm run build && cd ../.. && pip install -e . --no-deps
```

Ensure the `spatialxgene` command is on the `PATH` for the service user (e.g. use the pixi env: `~/.pixi/envs/default/bin/spatialxgene` or `/opt/spatialxgene/.pixi/envs/default/bin/spatialxgene`), or use an absolute path in the unit file.

## systemd unit template

Create `/etc/systemd/system/spatialxgene.service` with the following content. Replace placeholders as needed.

```ini
[Unit]
Description=Spatialxgene spatial transcriptomics viewer
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/spatialxgene
Environment="PATH=/usr/local/bin:/usr/bin"
ExecStart=/usr/local/bin/spatialxgene launch --data-dir /data/spatialxgene/data --host 0.0.0.0 --port 5005 --token YOUR_TOKEN --no-browser
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Placeholders

| Placeholder | Meaning |
|-------------|---------|
| `User`, `Group` | User and group to run the process (e.g. `www-data`, `spatialxgene`). Do not use root. |
| `WorkingDirectory` | Directory to run in; use project root if from source, or any stable path if installed via pip. |
| `ExecStart` | Full command. Use absolute path to `spatialxgene` if needed (e.g. `/opt/spatialxgene/.pixi/envs/default/bin/spatialxgene` when using pixi). |
| `--data-dir` | Path to the folder containing your h5ad files. |
| `--host` | `0.0.0.0` to accept connections on all IPv4 interfaces; use `127.0.0.1` if you put a reverse proxy in front. |
| `--port` | Port to listen on (default 5005). |
| `--no-browser` | Required on headless servers so the process does not try to open a browser. |
| `--token` | Optional auth token; if set, all `/api/*` requests must send this token. Default is disabled. Users open the app with `?token=YOUR_TOKEN` in the URL once to store it. |

### Example: from source with pixi

If you run from source with pixi:

```ini
WorkingDirectory=/opt/spatialxgene
ExecStart=/opt/spatialxgene/.pixi/envs/default/bin/spatialxgene launch --data-dir /data/spatialxgene/data --host 0.0.0.0 --port 5005 --token YOUR_TOKEN --no-browser
```

### Example: bind IPv6 only

```ini
ExecStart=/usr/local/bin/spatialxgene launch --data-dir /data/spatialxgene/data --host :: --port 5005 --token YOUR_TOKEN --no-browser
```

### Example: no token (open access)

```ini
ExecStart=/usr/local/bin/spatialxgene launch --data-dir /data/spatialxgene/data --host 0.0.0.0 --port 5005 --token "" --no-browser
```

## Deploy steps

1. **Create data directory and set permissions**

   ```bash
   sudo mkdir -p /data/spatialxgene/data
   sudo chown www-data:www-data /data/spatialxgene/data
   # Copy or symlink your h5ad files into /data/spatialxgene/data
   ```

2. **Install spatialxgene** (see [Install Spatialxgene](#install-spatialxgene) above).

3. **Create the systemd unit file**

   ```bash
   sudo nano /etc/systemd/system/spatialxgene.service
   ```
   Paste the template, then replace `User`, `Group`, `WorkingDirectory`, `ExecStart`, and `--data-dir` with your paths and user.

4. **Reload systemd, enable and start the service**

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable spatialxgene
   sudo systemctl start spatialxgene
   sudo systemctl status spatialxgene
   ```

5. **Open in browser**

   From another machine: `http://<server-ip>:5005`. From the server: `http://127.0.0.1:5005`.  
   If you use `--token`, open with the token once so the app can store it: `http://<server-ip>:5005/?token=YOUR_TOKEN`.

### Useful commands

| Command | Description |
|---------|-------------|
| `sudo systemctl start spatialxgene` | Start the service |
| `sudo systemctl stop spatialxgene` | Stop the service |
| `sudo systemctl restart spatialxgene` | Restart the service |
| `sudo systemctl status spatialxgene` | Show status and recent logs |
| `journalctl -u spatialxgene -f` | Follow service logs |

## Optional: reverse proxy (HTTPS)

To serve over HTTPS or hide the port, put Nginx (or Caddy) in front and proxy to `http://127.0.0.1:5005`.

1. In the unit file, use `--host 127.0.0.1` so the app only listens on localhost.
2. Configure Nginx with a server block that `proxy_pass http://127.0.0.1:5005` and TLS (e.g. certificate from Let’s Encrypt with certbot).

Example Nginx location (inside a `server { ... }` block with `listen 443 ssl` and certificate config):

```nginx
location / {
    proxy_pass http://127.0.0.1:5005;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Then reload Nginx and access the site via `https://your-domain`.

## See also

- [development.md](development.md) — Build and run from source, project layout.
- Root [README.md](../README.md) — User-facing install and commands.
