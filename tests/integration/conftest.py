"""Public-SDK fixtures for the two keyless, real-host integration scenarios."""

from __future__ import annotations

import json
from importlib.metadata import version
import os
from pathlib import Path
import subprocess
import time
import uuid
from dataclasses import dataclass

import pytest

try:
    from deepseek_harness import HarnessClient, HarnessConfig
    from pydantic import BaseModel
except ModuleNotFoundError as error:
    raise pytest.UsageError(
        "Install tests/integration/requirements.txt in a private Python environment first."
    ) from error

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
RUNTIME = HERE / "runtime"
MODULES = RUNTIME / "node_modules"
DSH = MODULES / ".bin/dsh"
FIXTURES = HERE / "fixtures"
# SDK env overrides merge with the caller. Keep installation/TLS settings, not
# inference credentials or another Harness configuration/profile selection.
KEEP_ENV = {
    "PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "SYSTEMROOT",
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
    "http_proxy", "https_proxy", "all_proxy", "no_proxy",
    "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR",
    "REQUESTS_CA_BUNDLE", "CURL_CA_BUNDLE",
}


class Empty(BaseModel):
    pass


def replace_tokens(value, tokens):
    """Expand explicit fixture paths; native replay interprets model scripts."""
    if isinstance(value, dict):
        return {key: replace_tokens(item, tokens) for key, item in value.items()}
    if isinstance(value, list):
        return [replace_tokens(item, tokens) for item in value]
    if isinstance(value, str):
        for token, replacement in tokens.items():
            value = value.replace(token, str(replacement))
    return value


@dataclass
class Phase:
    name: str
    session_id: str
    records: list[dict]
    notifications: list[dict]
    evidence: Path


class ReplayRun:
    """One scenario's private workspace/home and sequential native SDK phases."""

    def __init__(self, root: Path, tarball: Path, budget: int):
        self.root = root
        self.workspace = root / "workspace"
        self.workspace.mkdir()
        self.home = root / "home"
        self.session_id = "egm-test-" + uuid.uuid4().hex
        self.deadline = time.monotonic() + budget
        self.phases: list[Phase] = []
        self._started = False
        env = {**os.environ, "DSH_HOME": str(self.home)}
        result = subprocess.run(
            [str(DSH), "plugin", "--profile", "sdk", "add", str(tarball)],
            cwd=self.workspace, env=env, capture_output=True, text=True,
            timeout=self.remaining(),
        )
        (root / "install.log").write_text(result.stdout + result.stderr)
        assert result.returncode == 0, f"Plugin installation failed; evidence: {root}"
        self.plugin = (self.home / "profiles/sdk/node_modules/dsh-egm").resolve()
        identity = {
            "node": subprocess.check_output(["node", "--version"], text=True, timeout=self.remaining()).strip(),
            "python": subprocess.check_output([os.sys.executable, "--version"], text=True, timeout=self.remaining()).strip(),
            "python_packages": {name: version(name) for name in (
                "deepseek-harness-sdk", "deepseek-harness-runtime-bin", "pytest", "pydantic",
            )},
            "node_packages": {name: json.loads((MODULES / name / "package.json").read_text())["version"] for name in (
                "@deepseek-ai/dsh", "@deepseek-ai/dsh-llm-replay",
                "@deepseek-ai/dsh-agent-preset-registry", "@deepseek-ai/dsh-agent-preset", "pnpm",
            )},
            "plugin": json.loads((self.plugin / "package.json").read_text())["version"],
            "upstream": json.loads((REPO / "upstream.lock.json").read_text()),
        }
        (root / "identity.json").write_text(json.dumps(identity, indent=2) + "\n")

    def remaining(self, limit=60):
        remaining = self.deadline - time.monotonic()
        assert remaining > 0, f"Scenario timeout; evidence: {self.root}"
        return min(limit, remaining)

    def override(self, filename: str, phase: str):
        entries = json.loads((FIXTURES / filename).read_text())[phase]
        return replace_tokens(entries, {
            "__WORKSPACE__": self.workspace, "__PLUGIN__": self.plugin,
        })

    def phase(self, name: str, entries: list, prompt: str, children=()):
        """Run a fixed native script; preserve the same parent across phases."""
        self.remaining()
        directory = self.root / f"{len(self.phases) + 1:02d}-{name}"
        directory.mkdir()
        override = directory / "override.json"
        override.write_text(json.dumps(entries))
        child_files = []
        for ordinal, seed in enumerate(children, 1):
            # Only the native header identity changes; the complete writer event
            # stream remains intact and native replay owns parsing/validation.
            header, newline, events = (FIXTURES / seed).read_text().partition("\n")
            header = json.loads(header)
            header.update(id=f"synthetic-{name}-{ordinal}", createdAt=1000 + ordinal)
            child = directory / f"child-{ordinal}.session.jsonl"
            child.write_text(json.dumps(header) + newline + events)
            child_files.append(str(child))
        patch = replace_tokens(json.loads((HERE / "profile.patch.yml").read_text()), {
            "__MODULES__": MODULES, "__SESSIONS__": self.root / "sessions",
            "__OBSERVER__": HERE / "observer.mjs", "__OVERRIDE__": override,
        })
        patch[-1]["insert"][-1]["config"]["childFiles"] = child_files
        patch_path = directory / "profile.patch.yml"
        patch_path.write_text(json.dumps(patch))
        records_path = directory / "records.jsonl"
        config = HarnessConfig(
            dsh_bin=str(DSH), dsh_home=str(self.home), cwd=str(self.workspace),
            patches=(str(patch_path),), env={"EGM_TEST_RECORD": str(records_path)},
            initialize_timeout_seconds=self.remaining(30),
            request_timeout_seconds=self.remaining(), shutdown_timeout_seconds=3,
        )
        client = HarnessClient(config)
        notifications = []
        def collect(notification):
            notifications.append({"method": notification.method, "payload": notification.payload})
        try:
            client.start()
            client.initialize(cwd=str(self.workspace), provider="egm-replay", model="fixed")
            if self._started:
                config.request_timeout_seconds = self.remaining()
                client.resume_session(self.session_id)
            with client.subscribe_session_notifications(self.session_id) as subscription:
                config.request_timeout_seconds = self.remaining()
                client.session_prompt(
                    self.session_id, [{"type": "text", "text": prompt}],
                    notification_subscription=subscription, on_notification=collect,
                )
                client.request(
                    "session/wait", {"sessionId": self.session_id},
                    response_model=Empty, timeout_seconds=self.remaining(),
                    notification_subscription=subscription, on_notification=collect,
                )
                subscription.drain(collect)
        except Exception as error:
            raise AssertionError(f"Phase {name}: {error}; evidence: {directory}") from error
        finally:
            client.close()
            (directory / "notifications.json").write_text(json.dumps(notifications))
            records = [json.loads(line) for line in records_path.read_text().splitlines()] if records_path.exists() else []
            runtime = [record for record in records if record["kind"] == "runtime"]
            assert len(runtime) == 1, f"Missing/ambiguous owned runtime PID; evidence: {directory}"
            try:
                os.kill(runtime[0]["pid"], 0)
            except ProcessLookupError:
                pass
            else:
                raise AssertionError(f"Owned runtime remains after SDK close; evidence: {directory}")
        self._started = True
        phase = Phase(name, self.session_id, records, notifications, directory)
        self.phases.append(phase)
        self.remaining()
        return phase


@pytest.fixture(scope="session")
def packed_plugin(tmp_path_factory):
    if not DSH.is_file():
        pytest.fail("Missing integration runtime: run npm ci --prefix tests/integration/runtime")
    root = tmp_path_factory.mktemp("egm-package")
    result = subprocess.run(
        ["npm", "pack", "--json", "--pack-destination", str(root)],
        cwd=REPO, capture_output=True, text=True, timeout=60,
    )
    assert result.returncode == 0, result.stderr
    metadata = json.loads(result.stdout)[0]
    return root / metadata["filename"]


@pytest.fixture
def replay_run(tmp_path, monkeypatch, packed_plugin):
    for key in list(os.environ):
        if key not in KEEP_ENV:
            monkeypatch.delenv(key)
    monkeypatch.setenv("PATH", str(MODULES / ".bin") + os.pathsep + os.environ["PATH"])
    # Validate both committed native seeds with the runtime's public parser and
    # derivation API. Python does not parse or regenerate their Session events.
    script = """
      import {readFileSync} from 'node:fs';
      const {parseSessionLog, deriveReplayScript} = await import(process.argv[1]);
      for (const [file, expected] of [[process.argv[2], 2], [process.argv[3], 4]]) {
        const calls = deriveReplayScript(parseSessionLog(readFileSync(file, 'utf8')));
        if (calls.length !== expected) throw new Error(`Invalid seed ${file}: ${calls.length} calls`);
      }
    """
    validation = subprocess.run([
        "node", "--input-type=module", "-e", script,
        (MODULES / "@deepseek-ai/dsh-llm-replay/lib/index.js").as_uri(),
        str(FIXTURES / "child.session.jsonl"), str(FIXTURES / "readonly-child.session.jsonl"),
    ], capture_output=True, text=True, timeout=30)
    assert validation.returncode == 0, validation.stderr
    runs = []
    def create(budget=180):
        root = tmp_path / f"scenario-{len(runs) + 1}"
        root.mkdir()
        run = ReplayRun(root, packed_plugin, budget)
        runs.append(run)
        return run
    yield create
    for run in runs:
        print(f"EGM replay evidence: {run.root}")
