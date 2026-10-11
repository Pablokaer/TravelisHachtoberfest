"""The Linux and Windows release packages (D-091): what goes in, and that nothing private does."""

from __future__ import annotations

import tarfile
import zipfile
from pathlib import Path

import pytest

from wayfarer_pipeline import release


def tree(root: Path, files: dict[str, str]) -> Path:
    """A fake repository under ``root``: each key is a path, each value its content."""
    for rel, content in files.items():
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    return root


REPO = {
    "data-pipeline/wayfarer_pipeline/__init__.py": "",
    "data-pipeline/wayfarer_pipeline/cli.py": "print('cli')\n",
    "data-pipeline/cities.yaml": "cities: []\n",
    "data-pipeline/data/countries.json": "[]",
    "data-pipeline/data/attractions/lisbon.json": "{}",
    "data-pipeline/data/local/sintra.json": "{}",
    "data-pipeline/tests/test_x.py": "",
    "data-pipeline/.cache/http/abc": "cached",
    "data-pipeline/.venv/lib/x.py": "",
    "data-pipeline/wayfarer_pipeline/__pycache__/cli.cpython-313.pyc": "bytecode",
    "data-pipeline/requirements.txt": "requests\n",
    "supabase/config.toml": "project_id = 'wayfarer'\n",
    "supabase/migrations/1_init.sql": "select 1;",
    "supabase/seed/00_readme.sql": "select 1;",
    "supabase/functions/route-optimize/index.ts": "export {};",
    "supabase/functions/route-optimize/handler.test.ts": "test",
    "supabase/tests/995.test.sql": "select 1;",
    "supabase/.temp/cli-latest": "v2",
    ".env": "SERPAPI_API_KEY=a-real-secret\n",
    ".env.example": "SERPAPI_API_KEY=\nOLLAMA_MODEL=\n",
    "apps/mobile/src/x.tsx": "",
    "node_modules/x/index.js": "",
}


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    return tree(tmp_path / "repo", REPO)


@pytest.fixture
def web(tmp_path: Path) -> Path:
    return tree(tmp_path / "dist", {"index.html": "<html></html>", "_expo/static/js/app.js": "x"})


def names(files: list[tuple[Path, str]]) -> set[str]:
    return {name for _, name in files}


def test_the_runtime_is_collected_and_the_development_files_are_left_out(repo: Path) -> None:
    included = names(release.collect(repo))
    assert "data-pipeline/wayfarer_pipeline/cli.py" in included
    assert "data-pipeline/data/attractions/lisbon.json" in included
    assert "supabase/migrations/1_init.sql" in included
    assert "supabase/functions/route-optimize/index.ts" in included
    for left_out in (
        "data-pipeline/tests/test_x.py",
        "data-pipeline/.cache/http/abc",
        "data-pipeline/.venv/lib/x.py",
        "data-pipeline/data/local/sintra.json",
        "supabase/functions/route-optimize/handler.test.ts",
        "supabase/tests/995.test.sql",
        "supabase/.temp/cli-latest",
        "apps/mobile/src/x.tsx",
        "node_modules/x/index.js",
    ):
        assert left_out not in included, left_out
    assert not any("__pycache__" in name for name in included)


def test_the_real_env_file_is_never_collected(repo: Path) -> None:
    assert ".env" not in names(release.collect(repo))


def test_the_packaged_env_comes_from_the_example_not_from_the_real_one(repo: Path) -> None:
    env = release.packaged_env(repo)
    assert "a-real-secret" not in env
    assert "OLLAMA_MODEL=" in env


def test_linux_gets_a_tarball_with_an_executable_launcher(
    repo: Path, web: Path, tmp_path: Path
) -> None:
    archives = release.build_archives(repo, web, tmp_path / "out", "0.1.0")
    linux = next(a for a in archives if a.name.endswith("linux-x64.tar.gz"))
    with tarfile.open(linux) as tar:
        members = {m.name: m for m in tar.getmembers()}
        assert members["travelist-0.1.0/start.sh"].mode & 0o111
        launcher = tar.extractfile("travelist-0.1.0/start.sh")
        assert launcher is not None and b"\r" not in launcher.read()
        assert "travelist-0.1.0/web/index.html" in members
        assert "travelist-0.1.0/.env" in members
        assert "travelist-0.1.0/start.ps1" not in members


def test_windows_gets_a_zip_with_powershell_and_cmd_launchers(
    repo: Path, web: Path, tmp_path: Path
) -> None:
    archives = release.build_archives(repo, web, tmp_path / "out", "0.1.0")
    windows = next(a for a in archives if a.name.endswith("windows-x64.zip"))
    with zipfile.ZipFile(windows) as zf:
        listed = set(zf.namelist())
        assert "travelist-0.1.0/start.ps1" in listed
        assert "travelist-0.1.0/start.cmd" in listed
        assert "travelist-0.1.0/start.sh" not in listed
        assert "travelist-0.1.0/web/index.html" in listed
        assert "a-real-secret" not in zf.read("travelist-0.1.0/.env").decode()


def test_both_packages_carry_the_same_runtime_and_the_readme(
    repo: Path, web: Path, tmp_path: Path
) -> None:
    archives = release.build_archives(repo, web, tmp_path / "out", "0.1.0")
    with tarfile.open(next(a for a in archives if a.suffix == ".gz")) as tar:
        linux = {m.name for m in tar.getmembers() if m.isfile()}
    with zipfile.ZipFile(next(a for a in archives if a.suffix == ".zip")) as zf:
        windows = {n for n in zf.namelist() if not n.endswith("/")}
    shared = {n for n in linux if not n.endswith((".sh", ".ps1", ".cmd"))}
    assert shared == {n for n in windows if not n.endswith((".sh", ".ps1", ".cmd"))}
    assert "travelist-0.1.0/README.txt" in linux


def test_the_launchers_start_each_part_and_say_what_is_missing() -> None:
    assert "functions serve" in release.launcher_sh()
    assert '"functions","serve"' in release.launcher_ps1()
    for script in (release.launcher_sh(), release.launcher_ps1()):
        assert "supabase" in script
        assert "wayfarer_pipeline" in script and "serve" in script
        assert "serve_web.py" in script
        assert "Docker" in script and "Node" in script and "Python" in script


def test_the_web_server_falls_back_to_the_app_for_a_client_side_route() -> None:
    server = release.serve_web_py()
    assert "index.html" in server
    compile(server, "serve_web.py", "exec")


def test_the_version_is_in_the_archive_names(repo: Path, web: Path, tmp_path: Path) -> None:
    archives = release.build_archives(repo, web, tmp_path / "out", "1.2.3")
    assert {a.name for a in archives} == {
        "travelist-1.2.3-linux-x64.tar.gz",
        "travelist-1.2.3-windows-x64.zip",
    }


def test_the_web_server_maps_a_dynamic_route_to_its_exported_template(tmp_path: Path) -> None:
    """/short/lisbon is served by the exported short/[slug].html, /about by about.html."""
    site = tree(
        tmp_path / "site",
        {
            "index.html": "home",
            "about.html": "about",
            "short/[slug].html": "city",
            "serve_web.py": release.serve_web_py(),
        },
    )
    namespace: dict[str, object] = {"__name__": "serve_web_test"}
    exec(
        compile(
            release.serve_web_py().replace(
                "ROOT = os.path.dirname(os.path.abspath(__file__))", f"ROOT = {str(site)!r}"
            ),
            "serve_web.py",
            "exec",
        ),
        namespace,
    )
    page_for = namespace["Handler"].page_for  # type: ignore[attr-defined]
    root = str(site)
    assert page_for(f"{root}/short/lisbon").endswith("[slug].html")
    assert page_for(f"{root}/about").endswith("about.html")
    assert page_for(f"{root}/nothing/here").endswith("index.html")
