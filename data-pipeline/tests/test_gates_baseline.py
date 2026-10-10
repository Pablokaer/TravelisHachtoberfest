import subprocess

import pytest

from wayfarer_pipeline.gates.baseline import GitBaseline


def _repo(tmp_path):
    def git(*args):
        subprocess.run(["git", *args], cwd=tmp_path, check=True, capture_output=True)

    data = tmp_path / "data-pipeline" / "data"
    (data / "attractions").mkdir(parents=True)
    (data / "visa.csv").write_text("passport,destination\n", encoding="utf-8")
    (data / "attractions" / "porto.json").write_text("{}\n", encoding="utf-8")
    git("init", "-q")
    git("add", ".")
    git("-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "data")
    (data / "visa.csv").write_text("changed after the commit\n", encoding="utf-8")
    return tmp_path


def test_reads_the_committed_file_not_the_working_copy(tmp_path):
    baseline = GitBaseline("HEAD", repo_root=_repo(tmp_path))
    assert baseline.read_text("visa.csv") == "passport,destination\n"
    assert baseline.read_text("countries.json") is None
    assert baseline.list_attraction_files() == ["porto.json"]


def test_an_unknown_ref_is_an_error_naming_it(tmp_path):
    with pytest.raises(ValueError, match="'no-such-branch' not found"):
        GitBaseline("no-such-branch", repo_root=_repo(tmp_path))
