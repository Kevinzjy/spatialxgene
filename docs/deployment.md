# Deployment

How to run Spatialxgene as a long-running service: **Docker Compose** (recommended, especially on servers with older glibc) or **systemd** on Linux.

---

## Docker Compose

Recommended for portability and to avoid glibc/Python-version issues. From the project root:

```bash
docker compose -f docker/docker-compose.yml up -d
```

- **Data**: Default volume is `./data` → `/data` in the container; edit `volumes` in `docker/docker-compose.yml` to use another path. The viewer discovers `.h5ad` files in that directory and all subdirectories; dataset ids are relative paths without the `.h5ad` suffix (e.g. `subdir/sample`, `subdir/sample_v1.3`). Filenames with multiple dots (e.g. version numbers) are supported.
- **Token**: Default `--token zhaoslab`. Override with `command: ["--token", "your-secret"]` or `command: ["--token", ""]` to disable.
- **Port**: Default `5005`; change `ports` in the compose file if needed.

See [docker/README.md](../docker/README.md) for more options. If you only have a single nginx location (e.g. `/spatialxgene/`), set `--api-base spatialxgene` or `SPATIALXGENE_API_BASE=spatialxgene` so all assets and API use that path; see RULES.md §4.3 (server network permission).

---

## systemd (Linux)

### Prerequisites

- **Linux** with systemd (e.g. Debian, Ubuntu, RHEL, Rocky).
- **Python 3.9+** and `pip` or [uv](https://github.com/astral-sh/uv).
- A **data directory** containing preprocessed h5ad files (or empty; you can add data later).
- A **non-root user** to run the service (e.g. `www-data`, `spatialxgene`, or your app user).

## Install Spatialxgene

Either install from PyPI:

```bash
pip install spatialxgene
# or: uv pip install spatialxgene
```

Or from source (e.g. in `/opt/spatialxgene`):

```bash
cd /opt/spatialxgene
uv sync
# Build frontend so the packaged app serves the UI
cd spatialxgene/frontend && npm install && npm run build && cd ../..
```

Ensure the `spatialxgene` (or `uv run spatialxgene`) command is on the `PATH` for the service user, or use an absolute path in the unit file.

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
ExecStart=/usr/local/bin/spatialxgene launch --data-dir /data/spatialxgene/data --host 0.0.0.0 --port 5005 --token zhaoslab --no-browser
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
| `ExecStart` | Full command. Use absolute path to `spatialxgene` if needed (e.g. `/opt/spatialxgene/.venv/bin/spatialxgene` or `uv run spatialxgene` with correct `WorkingDirectory`). |
| `--data-dir` | Path to the folder containing your h5ad files. |
| `--host` | `0.0.0.0` to accept connections on all IPv4 interfaces; use `127.0.0.1` if you put a reverse proxy in front. |
| `--port` | Port to listen on (default 5005). |
| `--no-browser` | Required on headless servers so the process does not try to open a browser. |
| `--token` | Optional auth token; if set, all `/api/*` requests must send this token (default: `zhaoslab`). Use `--token ""` to disable. Users open the app with `?token=YOUR_TOKEN` in the URL once to store it. |

### Example: from source with uv

If you run from source and use `uv`:

```ini
WorkingDirectory=/opt/spatialxgene
ExecStart=/opt/spatialxgene/.venv/bin/spatialxgene launch --data-dir /data/spatialxgene/data --host 0.0.0.0 --port 5005 --token zhaoslab --no-browser
```

### Example: bind IPv6 only

```ini
ExecStart=/usr/local/bin/spatialxgene launch --data-dir /data/spatialxgene/data --host :: --port 5005 --token zhaoslab --no-browser
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
   If you use `--token` (default `zhaoslab`), open with the token once so the app can store it: `http://<server-ip>:5005/?token=zhaoslab`.

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
