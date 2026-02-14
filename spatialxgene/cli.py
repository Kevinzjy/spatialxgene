"""
Spatialxgene CLI: subcommands launch (browser viewer), preprocess (QC + reduce + cluster), visium2h5ad, seurat2h5ad.
"""
import argparse
import os
import re
import socket
import subprocess
import sys
import warnings
from pathlib import Path
from typing import Optional

# Suppress louvain's pkg_resources deprecation warning (setuptools>=81; RULES.md: we pin setuptools<81)
warnings.filterwarnings(
    "ignore",
    message=".*pkg_resources is deprecated.*",
    category=UserWarning,
)

# Env var for api-base (e.g. in Docker): SPATIALXGENE_API_BASE=spatialxgene so static/API paths use that prefix
_API_BASE_ENV = "SPATIALXGENE_API_BASE"


def _resolve_api_base(args: argparse.Namespace) -> str:
    """CLI --api-base or SPATIALXGENE_API_BASE env; for use in launch."""
    from_cli = (getattr(args, "api_base", "") or "").strip()
    if from_cli:
        return from_cli
    return (os.environ.get(_API_BASE_ENV) or "").strip()


def _local_ipv4_addresses() -> list[str]:
    """Return list of IPv4 addresses this machine can be reached at (127.0.0.1 first, then others).
    Uses interface enumeration so all NICs (e.g. LAN 192.168.x, VPN, etc.) are listed, not only
    the hostname-resolved IP(s) from gethostbyname_ex().
    """
    seen: set[str] = set()
    result: list[str] = []

    def add(addr: str) -> None:
        if not addr or ":" in addr or addr in seen:
            return
        seen.add(addr)
        result.append(addr)

    add("127.0.0.1")

    # Linux: hostname -I returns all IPv4 addrs (space-separated) from all interfaces
    if sys.platform == "linux":
        try:
            out = subprocess.run(
                ["hostname", "-I"],
                capture_output=True,
                text=True,
                timeout=2,
                check=False,
            )
            if out.returncode == 0 and out.stdout:
                for part in out.stdout.strip().split():
                    add(part)
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            pass

    # macOS: ifconfig gives inet <addr> per interface
    if sys.platform == "darwin":
        try:
            out = subprocess.run(
                ["ifconfig"],
                capture_output=True,
                text=True,
                timeout=2,
                check=False,
            )
            if out.returncode == 0 and out.stdout:
                for m in re.finditer(r"inet (\d+\.\d+\.\d+\.\d+)", out.stdout):
                    add(m.group(1))
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            pass

    # Fallback (and Windows): hostname resolution; often only one non-loopback IP
    if len(result) <= 1:
        try:
            _, _, ip_list = socket.gethostbyname_ex(socket.gethostname())
            for addr in ip_list:
                add(addr)
        except (socket.gaierror, OSError):
            pass

    # Keep 127.0.0.1 first, sort rest by address for stable order
    if len(result) > 1:
        others = [a for a in result if a != "127.0.0.1"]
        others.sort(key=lambda s: tuple(int(x) for x in s.split(".")))
        result = (["127.0.0.1"] if "127.0.0.1" in seen else []) + others
    return result


def _local_ipv6_addresses() -> list[str]:
    """Return list of IPv6 addresses this machine can be reached at (::1 first, then others)."""
    seen: set[str] = set()
    result: list[str] = []

    def add(addr: str) -> None:
        addr = addr.strip().split("%")[0]  # drop zone id e.g. fe80::1%eth0
        if not addr or addr in seen:
            return
        seen.add(addr)
        result.append(addr)

    add("::1")

    # Linux: ip -6 addr show
    if sys.platform == "linux":
        try:
            out = subprocess.run(
                ["ip", "-6", "addr", "show"],
                capture_output=True,
                text=True,
                timeout=2,
                check=False,
            )
            if out.returncode == 0 and out.stdout:
                for m in re.finditer(r"inet6 ([0-9a-f:]+)/\d+", out.stdout, re.IGNORECASE):
                    add(m.group(1))
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            pass

    # macOS: ifconfig has inet6 <addr> ...
    if sys.platform == "darwin":
        try:
            out = subprocess.run(
                ["ifconfig"],
                capture_output=True,
                text=True,
                timeout=2,
                check=False,
            )
            if out.returncode == 0 and out.stdout:
                for m in re.finditer(r"inet6 ([0-9a-f:]+)", out.stdout, re.IGNORECASE):
                    add(m.group(1))
        except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
            pass

    # Keep ::1 first, then sort others (e.g. stable order)
    if len(result) > 1:
        others = [a for a in result if a != "::1"]
        others.sort(key=lambda s: (s.startswith("fe80"), s))  # link-local last
        result = (["::1"] if "::1" in seen else []) + others
    return result


def _host_is_listen_all(host: str) -> bool:
    """True if host means listen on all interfaces (IPv4 or IPv6)."""
    h = (host or "").strip().lower()
    return h in ("0.0.0.0", "::", "::0")


def _format_server_url(host: str, port: int) -> str:
    """Format host:port as http URL; IPv6 addresses are wrapped in brackets."""
    h = host or "0.0.0.0"
    if ":" in h:
        return f"http://[{h}]:{port}"
    return f"http://{h}:{port}"


def _append_token(url: str, token: Optional[str]) -> str:
    """Append ?token= to URL when token is set (for display and browser open)."""
    if not token or not token.strip():
        return url
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}token={token.strip()}"


def _cmd_launch(args: argparse.Namespace) -> None:
    """Launch the browser-based visualization platform."""
    root = Path(__file__).resolve().parent
    frontend_dir = root / "frontend"
    static_dir = frontend_dir / "dist"

    if args.build or not (static_dir / "index.html").exists():
        if not (frontend_dir / "package.json").exists():
            print(
                "Frontend not found. Run from project root: npm install && npm run build in spatialxgene/frontend/",
                file=sys.stderr,
            )
            sys.exit(1)
        print("Building frontend...")
        subprocess.run(["npm", "run", "build"], cwd=frontend_dir, check=True)

    if not static_dir.exists() or not (static_dir / "index.html").exists():
        print(
            "Frontend not built. Run: cd spatialxgene/frontend && npm install && npm run build",
            file=sys.stderr,
        )
        sys.exit(1)

    import uvicorn
    from spatialxgene.server.main import get_app, set_data_dir, set_static_dir, set_debug, set_token, set_api_base, mount_static

    set_data_dir(args.data_dir.resolve())
    set_static_dir(static_dir)
    set_debug(getattr(args, "debug", False))
    set_token(getattr(args, "token", None))
    set_api_base(_resolve_api_base(args))
    mount_static(static_dir)

    api_base = _resolve_api_base(args)
    base_path = f"/{api_base.strip('/')}" if api_base.strip() else ""
    url = _format_server_url(args.host, args.port)
    token = getattr(args, "token", None)
    print(f"Spatialxgene serving at {url}")
    if base_path:
        print(f"  With --api-base: open {url.rstrip('/')}{base_path}/ to test subpath (favicon, assets, API).")
    if _host_is_listen_all(args.host):
        addrs = _local_ipv4_addresses()
        if addrs:
            access_urls = [_append_token(f"http://{a}:{args.port}", token) for a in addrs]
            print("  Access:", ", ".join(access_urls))
        if args.host.strip().lower() in ("::", "::0"):
            ipv6_addrs = _local_ipv6_addresses()
            if ipv6_addrs:
                ipv6_urls = [_append_token(_format_server_url(a, args.port), token) for a in ipv6_addrs]
                print("  Access (IPv6):", ", ".join(ipv6_urls))
    print(f"Data directory: {args.data_dir}")
    if getattr(args, "debug", False):
        print("Debug mode: on (browser console will show verbose logs)")
    if not args.no_browser:
        import webbrowser
        open_url = f"http://127.0.0.1:{args.port}" if _host_is_listen_all(args.host) else url
        if base_path:
            open_url = open_url.rstrip("/") + base_path + "/"
        webbrowser.open(_append_token(open_url, token))

    uvicorn.run(get_app(), host=args.host, port=args.port, log_level="info")


def _cmd_preprocess(args: argparse.Namespace) -> None:
    """Preprocess raw h5ad: QC, normalize, reduce, cluster. Does not modify spatial."""
    import logging

    from spatialxgene.preprocess import preprocess_file, preprocess_directory

    logging.basicConfig(
        level=logging.INFO,
        format="[preprocess] %(message)s",
        stream=sys.stderr,
        force=True,
    )
    input_path = args.input.resolve()
    output_path = args.output.resolve() if args.output else None

    kwargs = dict(
        min_genes=args.min_genes,
        min_cells=args.min_cells,
        n_top_genes=args.n_top_genes,
        n_pcs=args.n_pcs,
        n_neighbors=args.n_neighbors,
        resolution=args.resolution,
        save_raw_layer=not getattr(args, "no_raw_layer", False),
        run_cluster=not getattr(args, "no_cluster", False),
    )

    if input_path.is_file():
        if input_path.suffix != ".h5ad":
            print("Input must be a .h5ad file when passing a file.", file=sys.stderr)
            sys.exit(1)
        out = output_path or input_path.parent / f"{input_path.stem}_processed.h5ad"
        if out.is_dir():
            print("Output must be a file path (e.g. preprocessed.h5ad), not a directory.", file=sys.stderr)
            sys.exit(1)
        out = out.resolve()
        print(f"Preprocessing {input_path} -> {out}")
        written = preprocess_file(input_path, out, **kwargs)
        print(f"Wrote {written}")
        return

    if input_path.is_dir():
        out_dir = output_path or input_path / "preprocessed"
        if out_dir.is_file():
            print("When input is a directory, output must be a directory.", file=sys.stderr)
            sys.exit(1)
        print(f"Preprocessing all .h5ad in {input_path} -> {out_dir}")
        preprocess_directory(
            input_path,
            out_dir,
            exclude_name_containing=args.exclude,
            **kwargs,
        )
        print("Done.")
        return

    print(f"Input not found: {input_path}", file=sys.stderr)
    sys.exit(1)


def _cmd_visium2h5ad(args: argparse.Namespace) -> None:
    """Convert Visium Space Ranger output directory to a single h5ad file."""
    from spatialxgene.visium2h5ad import visium_to_h5ad

    input_path = args.input.resolve()
    if args.output is not None:
        output_path = args.output.resolve()
    else:
        # Default: a/b/c -> a/b/c.h5ad
        output_path = input_path.with_suffix(".h5ad")

    if not input_path.is_dir():
        print(f"Input must be a Visium directory: {input_path}", file=sys.stderr)
        sys.exit(1)
    if output_path.is_dir():
        print("Output must be a file path (e.g. output.h5ad), not a directory.", file=sys.stderr)
        sys.exit(1)

    try:
        written = visium_to_h5ad(
            input_path,
            output_path,
            count_file=getattr(args, "count_file", None) or None,
            load_images=not getattr(args, "no_images", False),
        )
    except FileNotFoundError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"visium2h5ad failed: {e}", file=sys.stderr)
        raise

    print(f"Wrote {written}")


def _cmd_seurat2h5ad(args: argparse.Namespace) -> None:
    """Convert Seurat spatial RDS (.rds or .rds.gz) to a single h5ad file."""
    from spatialxgene.seurat2h5ad import seurat_to_h5ad

    input_path = args.input.resolve()
    if args.output is not None:
        output_path = args.output.resolve()
    else:
        # Default: strip .gz and .rds -> .h5ad (e.g. sample.rds.gz -> sample.h5ad)
        stem = input_path.stem
        if stem.endswith(".rds"):
            stem = stem[:-4]
        output_path = input_path.parent / f"{stem}.h5ad"

    if not input_path.is_file():
        print(f"Input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)
    if output_path.is_dir():
        print("Output must be a file path (e.g. output.h5ad), not a directory.", file=sys.stderr)
        sys.exit(1)

    try:
        written = seurat_to_h5ad(
            input_path,
            output_path,
            rscript=getattr(args, "rscript", None) or None,
        )
    except FileNotFoundError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)
    except RuntimeError as e:
        print(f"seurat2h5ad failed: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Wrote {written}")


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="spatialxgene",
        description="Spatial transcriptomics viewer and preprocessing (cellxgene-style).",
    )
    subparsers = parser.add_subparsers(dest="command", required=True, help="Subcommand")

    # ---- launch ----
    launch_p = subparsers.add_parser("launch", help="Start the browser-based visualization platform")
    launch_p.add_argument(
        "--data-dir",
        type=Path,
        default=Path.cwd(),
        help="Directory containing preprocessed h5ad files",
    )
    launch_p.add_argument(
        "--host",
        type=str,
        default="0.0.0.0",
        help="Bind host (e.g. 0.0.0.0 for all IPv4, :: for all IPv6)",
    )
    launch_p.add_argument("--port", type=int, default=5005, help="Port")
    launch_p.add_argument(
        "--token",
        type=str,
        default="zhaoslab",
        help="Auth token required for /api/* (default: zhaoslab); use empty string to disable",
    )
    launch_p.add_argument("--no-browser", action="store_true", help="Do not open browser")
    launch_p.add_argument("--build", action="store_true", help="Build frontend before starting")
    launch_p.add_argument("--debug", action="store_true", help="Enable debug mode: verbose console logs in browser")
    launch_p.add_argument(
        "--api-base",
        type=str,
        default="",
        help="Public base path when behind a reverse proxy (e.g. spatialxgene for location /spatialxgene/); empty = root. Can also set env SPATIALXGENE_API_BASE (e.g. in Docker).",
    )
    launch_p.set_defaults(func=_cmd_launch)

    # ---- preprocess ----
    preprocess_p = subparsers.add_parser(
        "preprocess",
        help="Preprocess expression: QC, normalize, reduce dimensions, cluster. Output keeps all genes that passed QC; HVG used only for dimred. Does not modify spatial.",
    )
    preprocess_p.add_argument(
        "input",
        type=Path,
        help="Input: path to a single .h5ad file or a directory of .h5ad files",
    )
    preprocess_p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Output file (if input is file) or directory (if input is dir). Default: same dir, name_processed.h5ad (e.g. a/b/c.h5ad -> a/b/c_processed.h5ad) or input/preprocessed/",
    )
    preprocess_p.add_argument("--exclude", type=str, default="processed", help="Skip input files whose name contains this (default: processed, so *_processed.h5ad are not re-processed)")
    preprocess_p.add_argument("--min-genes", type=int, default=200, help="Minimum genes per cell (default 200)")
    preprocess_p.add_argument("--min-cells", type=int, default=3, help="Minimum cells per gene (default 3)")
    preprocess_p.add_argument("--n-top-genes", type=int, default=2000, help="Number of highly variable genes (default 2000)")
    preprocess_p.add_argument("--n-pcs", type=int, default=50, help="Number of PCA components (default 50)")
    preprocess_p.add_argument("--n-neighbors", type=int, default=15, help="Neighbors for graph (default 15)")
    preprocess_p.add_argument("--resolution", type=float, default=1.0, help="Leiden resolution (default 1.0)")
    preprocess_p.add_argument(
        "--no-raw-layer",
        action="store_true",
        help="Do not save raw counts in layers['counts'] (saves memory on large datasets)",
    )
    preprocess_p.add_argument(
        "--no-cluster",
        action="store_true",
        help="Skip Leiden/Louvain clustering (avoids high memory from igraph on very large datasets; output still has PCA, UMAP, neighbors)",
    )
    preprocess_p.set_defaults(func=_cmd_preprocess)

    # ---- visium2h5ad ----
    visium2h5ad_p = subparsers.add_parser(
        "visium2h5ad",
        help="Convert Visium Space Ranger output directory to a single h5ad file.",
    )
    visium2h5ad_p.add_argument(
        "input",
        type=Path,
        help="Path to the Visium sample directory (contains spatial/ and filtered_feature_bc_matrix)",
    )
    visium2h5ad_p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Output .h5ad file path (default: input with .h5ad suffix, e.g. a/b/c -> a/b/c.h5ad)",
    )
    visium2h5ad_p.add_argument(
        "--count-file",
        type=str,
        default=None,
        help="Count matrix file or dir under input (default: auto-detect filtered_feature_bc_matrix.h5 or filtered_feature_bc_matrix)",
    )
    visium2h5ad_p.add_argument(
        "--no-images",
        action="store_true",
        help="Do not load tissue images into the h5ad (smaller file)",
    )
    visium2h5ad_p.set_defaults(func=_cmd_visium2h5ad)

    # ---- seurat2h5ad ----
    seurat2h5ad_p = subparsers.add_parser(
        "seurat2h5ad",
        help="Convert Seurat spatial RDS (.rds or .rds.gz) to a single h5ad file.",
    )
    seurat2h5ad_p.add_argument(
        "input",
        type=Path,
        help="Path to the Seurat RDS file (.rds or .rds.gz)",
    )
    seurat2h5ad_p.add_argument(
        "-o",
        "--output",
        type=Path,
        default=None,
        help="Output .h5ad file path (default: input stem with .h5ad, e.g. sample.rds.gz -> sample.h5ad)",
    )
    seurat2h5ad_p.add_argument(
        "--rscript",
        type=str,
        default=None,
        help="Path to Rscript executable (default: RSCRIPT env or Rscript on PATH)",
    )
    seurat2h5ad_p.set_defaults(func=_cmd_seurat2h5ad)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
