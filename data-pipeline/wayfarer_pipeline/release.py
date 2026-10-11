"""The Linux and Windows release packages (D-091).

Travelist is an Expo app (phone and web) with a local stack; there is no desktop application. A
"release for Linux / Windows" is therefore the **local stack in a box**: the web app already
exported, the city and trip-planner service, the database (migrations and seeds), the route
functions and a launcher that starts them all. Both packages carry the same runtime and differ
only in the launcher (``start.sh`` or ``start.ps1`` / ``start.cmd``). Nothing private goes in: the
packaged ``.env`` is made from ``.env.example``, never from the developer's own ``.env``.
"""

# The launcher scripts below are text for other shells: their lines are as long as they need.
# ruff: noqa: E501

from __future__ import annotations

import io
import tarfile
import zipfile
from pathlib import Path

SUPABASE_CLI = "supabase@2.118.0"  # the version the repository pins (package.json)
REQUIREMENTS = "requests>=2.32\npydantic>=2.8\nPyYAML>=6.0\nsentry-sdk>=2.0\npymongo>=4.8\n"
SKIPPED_DIRS = {".cache", ".venv", "__pycache__", ".pytest_cache", ".ruff_cache", "tests", ".temp"}
SKIPPED_TOP = {"data-pipeline/data/local", "supabase/.branches"}
SKIPPED_SUFFIXES = (".pyc", ".test.ts")
RUNTIME_ROOTS = ("data-pipeline", "supabase")
# Whole `supabase/` minus its tests, but nothing else of the repository.
Files = list[tuple[Path, str]]


def _wanted(rel: Path) -> bool:
    parts = rel.parts
    if any(part in SKIPPED_DIRS for part in parts):
        return False
    if any("/".join(parts).startswith(top) for top in SKIPPED_TOP):
        return False
    return not rel.name.endswith(SKIPPED_SUFFIXES)


def collect(repo: Path) -> Files:
    """The runtime files of the repository as ``(path on disk, path in the package)``.

    >>> collect(Path("."))[0]  # (Path('data-pipeline/cities.yaml'), 'data-pipeline/cities.yaml')
    """
    found: Files = []
    for top in RUNTIME_ROOTS:
        for path in sorted((repo / top).rglob("*")):
            rel = path.relative_to(repo)
            if path.is_file() and _wanted(rel):
                found.append((path, rel.as_posix()))
    return found


def packaged_env(repo: Path) -> str:
    """``.env.example`` as the package's ``.env``: local defaults and no secret."""
    return (repo / ".env.example").read_text(encoding="utf-8")


def serve_web_py() -> str:
    return '''"""Serves the Travelist web app: its files, and index.html for any client-side route."""
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def send_head(self):
        path = self.translate_path(self.path.split("?")[0].split("#")[0])
        if not os.path.exists(path):
            target = self.page_for(path)
            self.path = "/" + os.path.relpath(target, ROOT).replace(os.sep, "/")
        return super().send_head()

    @staticmethod
    def page_for(path):
        """/about -> about.html; /short/lisbon -> short/[slug].html; else the app's index.html."""
        folder = os.path.dirname(path)
        candidates = [path + ".html"]
        if os.path.isdir(folder):
            candidates += sorted(
                os.path.join(folder, name)
                for name in os.listdir(folder)
                if name.startswith("[") and name.endswith("].html")
            )
        candidates.append(os.path.join(ROOT, "index.html"))
        return next(c for c in candidates if os.path.exists(c))


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8081
    server = http.server.ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"Travelist web app on http://localhost:{port}", flush=True)
    server.serve_forever()
'''


def launcher_sh() -> str:
    return f"""#!/usr/bin/env bash
# Travelist: starts the whole local stack. Needs Docker (running), Node.js 22+ and Python 3.11+.
set -euo pipefail
cd "$(dirname "${{BASH_SOURCE[0]}}")"
SUPABASE="npx --yes {SUPABASE_CLI}"

need() {{ command -v "$1" >/dev/null 2>&1 || {{ echo "Missing: $1. $2"; exit 1; }}; }}
need docker "Install Docker (https://docs.docker.com/engine/install/)."
need node "Install Node.js 22 or newer (https://nodejs.org)."
need python3 "Install Python 3.11 or newer."
docker info >/dev/null 2>&1 || {{ echo "Docker is not running: start it and try again."; exit 1; }}
command -v ollama >/dev/null 2>&1 || echo "Ollama not found: the AI planner is off (https://ollama.com)."

mkdir -p logs
[ -d .venv ] || python3 -m venv .venv
.venv/bin/python -m pip install -q -r data-pipeline/requirements.txt
trap 'kill $(jobs -p) 2>/dev/null || true' EXIT

echo "Starting the database (first run loads the data, a few minutes)..."
$SUPABASE start
$SUPABASE functions serve --env-file .env > logs/functions.log 2>&1 &
(cd data-pipeline && ../.venv/bin/python -m wayfarer_pipeline serve --host 0.0.0.0 --port 8787) \\
  > logs/service.log 2>&1 &

echo "Travelist is at http://localhost:8081 (Ctrl+C stops it; ./stop.sh stops the database)."
.venv/bin/python web/serve_web.py 8081
"""


def stop_sh() -> str:
    return f"""#!/usr/bin/env bash
# Stops the local database started by start.sh.
cd "$(dirname "${{BASH_SOURCE[0]}}")"
npx --yes {SUPABASE_CLI} stop
"""


def launcher_ps1() -> str:
    return f'''# Travelist: starts the whole local stack. Needs Docker Desktop (running), Node.js 22+ and Python 3.11+.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
$Supabase = "{SUPABASE_CLI}"

function Need($name, $help) {{
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {{ Write-Host "Missing: $name. $help"; exit 1 }}
}}
Need docker "Install Docker Desktop (https://www.docker.com/products/docker-desktop/)."
Need node "Install Node.js 22 or newer (https://nodejs.org)."
Need python "Install Python 3.11 or newer (https://www.python.org)."
docker info *> $null
if ($LASTEXITCODE -ne 0) {{ Write-Host "Docker is not running: start Docker Desktop and try again."; exit 1 }}
if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {{ Write-Host "Ollama not found: the AI planner is off (https://ollama.com)." }}

New-Item -ItemType Directory -Force logs | Out-Null
if (-not (Test-Path .venv)) {{ python -m venv .venv }}
& .venv\\Scripts\\python.exe -m pip install -q -r data-pipeline\\requirements.txt

Write-Host "Starting the database (first run loads the data, a few minutes)..."
npx --yes $Supabase start
$functions = Start-Process npx -ArgumentList "--yes",$Supabase,"functions","serve","--env-file",".env" `
  -RedirectStandardOutput logs\\functions.log -RedirectStandardError logs\\functions.err -WindowStyle Hidden -PassThru
$service = Start-Process "$PSScriptRoot\\.venv\\Scripts\\python.exe" `
  -ArgumentList "-m","wayfarer_pipeline","serve","--host","0.0.0.0","--port","8787" `
  -WorkingDirectory "$PSScriptRoot\\data-pipeline" -RedirectStandardOutput logs\\service.log `
  -RedirectStandardError logs\\service.err -WindowStyle Hidden -PassThru
try {{
  Write-Host "Travelist is at http://localhost:8081 (Ctrl+C stops it; stop.ps1 stops the database)."
  & .venv\\Scripts\\python.exe web\\serve_web.py 8081
}} finally {{
  Stop-Process -Id $functions.Id, $service.Id -Force -ErrorAction SilentlyContinue
}}
'''


def stop_ps1() -> str:
    return f"""# Stops the local database started by start.ps1.
Set-Location $PSScriptRoot
npx --yes {SUPABASE_CLI} stop
"""


def start_cmd() -> str:
    return '@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"\r\n'


def readme_txt(version: str) -> str:
    return f"""Travelist {version} - the local stack in a box

What is inside: the web app (web/), the city and trip-planner service (data-pipeline/), the
database (supabase/: migrations, data for 198 cities) and the route functions.

You need
  - Docker (running)        https://www.docker.com
  - Node.js 22 or newer     https://nodejs.org
  - Python 3.11 or newer    https://www.python.org
  - Ollama (optional, for the AI trip planner)   https://ollama.com
        ollama pull gemma3:4b      and set OLLAMA_MODEL=gemma3:4b in .env

Start
  Linux:    ./start.sh          (or: bash start.sh)
  Windows:  double-click start.cmd, or run start.ps1 in PowerShell
Then open http://localhost:8081. The first start downloads the database images and loads the
data, which takes a few minutes. Stop with Ctrl+C, then ./stop.sh (stop.ps1) to stop the database.

Optional keys (SerpApi, ElevenLabs, MongoDB Atlas, Sentry) go in .env; see docs in the repository:
https://github.com/Pablokaer/TravelisHachtoberfest

This is a local, single-user setup: the services listen on your machine without sign-in.
"""


def _text_entries(version: str) -> dict[str, tuple[str, int]]:
    """Generated files common to both packages: ``name -> (text, unix mode)``."""
    return {
        "web/serve_web.py": (serve_web_py(), 0o644),
        "data-pipeline/requirements.txt": (REQUIREMENTS, 0o644),
        "README.txt": (readme_txt(version), 0o644),
    }


def _linux_entries() -> dict[str, tuple[str, int]]:
    return {"start.sh": (launcher_sh(), 0o755), "stop.sh": (stop_sh(), 0o755)}


def _windows_entries() -> dict[str, tuple[str, int]]:
    crlf = lambda text: text.replace("\r\n", "\n").replace("\n", "\r\n")  # noqa: E731
    return {
        "start.ps1": (crlf(launcher_ps1()), 0o644),
        "stop.ps1": (crlf(stop_ps1()), 0o644),
        "start.cmd": (start_cmd(), 0o644),
    }


def _files(repo: Path, web: Path) -> Files:
    """Everything both packages hold that lives on disk: the runtime and the exported web app."""
    on_disk = collect(repo)
    on_disk += [
        (p, f"web/{p.relative_to(web).as_posix()}") for p in sorted(web.rglob("*")) if p.is_file()
    ]
    generated = {"data-pipeline/requirements.txt", "web/serve_web.py"}
    return [(p, name) for p, name in on_disk if name not in generated]


def _write_tar(path: Path, root: str, files: Files, text: dict[str, tuple[str, int]]) -> None:
    with tarfile.open(path, "w:gz") as tar:
        for source, name in files:
            tar.add(source, arcname=f"{root}/{name}", recursive=False)
        for name, (content, mode) in text.items():
            data = content.encode("utf-8")
            info = tarfile.TarInfo(f"{root}/{name}")
            info.size, info.mode = len(data), mode
            tar.addfile(info, io.BytesIO(data))


def _write_zip(path: Path, root: str, files: Files, text: dict[str, tuple[str, int]]) -> None:
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        for source, name in files:
            zf.write(source, f"{root}/{name}")
        for name, (content, _mode) in text.items():
            zf.writestr(f"{root}/{name}", content.encode("utf-8"))


def build_archives(repo: Path, web: Path, out: Path, version: str) -> list[Path]:
    """Writes ``travelist-<version>-linux-x64.tar.gz`` and ``…-windows-x64.zip`` into ``out``.

    >>> build_archives(Path("."), Path("apps/mobile/dist"), Path("dist/release"), "0.1.0")
    """
    out.mkdir(parents=True, exist_ok=True)
    root, files = f"travelist-{version}", _files(repo, web)
    env = {".env": (packaged_env(repo), 0o644)}
    linux = {**_text_entries(version), **_linux_entries(), **env}
    windows = {**_text_entries(version), **_windows_entries(), **env}
    tar_path = out / f"{root}-linux-x64.tar.gz"
    zip_path = out / f"{root}-windows-x64.zip"
    _write_tar(tar_path, root, files, linux)
    _write_zip(zip_path, root, files, windows)
    return [tar_path, zip_path]
