"""Keyless, opt-in network provenance verification; never invokes a model."""
import ast
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

root = Path(__file__).resolve().parent
meta = json.loads((root / "fixtures/dsh_line_count_provenance.json").read_text(encoding="utf-8"))
url = f"{meta['source_repository'].replace('https://github.com/', 'https://raw.githubusercontent.com/')}/{meta['source_commit']}/{meta['source_path']}"
with urlopen(url, timeout=30) as response:
    source = response.read()
blob = hashlib.sha1(b"blob " + str(len(source)).encode() + b"\0" + source).hexdigest()
assert blob == meta["source_git_blob_sha1"], blob
function = next(node for node in ast.walk(ast.parse(source)) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == meta["source_function"])
assignments = [node for node in ast.walk(function) if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == meta["source_variable"] for target in node.targets)]
assert len(assignments) == 1
prompt = ast.literal_eval(assignments[0].value).encode("utf-8")
assert hashlib.sha256(prompt).hexdigest() == meta["prompt_sha256"]
assert prompt == (root / "fixtures/dsh_line_count_prompt.txt").read_bytes()
print(f"PASS: Git blob {blob}; {len(prompt)} prompt bytes; SHA-256 {meta['prompt_sha256']}")
