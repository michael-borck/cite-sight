"""Python wrapper for the CiteSight CLI.

Thin and honest: every function shells out to the `cite-sight` command
(Node.js, installed via `npm install -g cite-sight`) and returns the parsed
JSON. Requires Node.js 20+; nothing else. Set CITESIGHT_CLI to point at a
specific binary.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any, Iterable

__version__ = "0.12.0"
__all__ = ["CiteSightError", "is_cli_available", "check", "claims", "library_plan", "claim_overlap", "about"]


class CiteSightError(RuntimeError):
    """The cite-sight CLI is missing, or exited non-zero."""


def is_cli_available() -> bool:
    """True when the cite-sight CLI can be found. Call this before showing
    claim-checking UI in your own tool; all wrapper functions raise
    CiteSightError with install instructions when it is missing."""
    return bool(os.environ.get("CITESIGHT_CLI") or shutil.which("cite-sight"))


def _cli() -> str:
    override = os.environ.get("CITESIGHT_CLI")
    if override:
        return override
    found = shutil.which("cite-sight")
    if not found:
        raise CiteSightError(
            "The 'cite-sight' CLI was not found on PATH. "
            "Install Node.js 20+ and run: npm install -g cite-sight "
            "(or set CITESIGHT_CLI to the binary path)."
        )
    return found


def _run(args: list[str], *, timeout: float | None) -> dict[str, Any]:
    result = subprocess.run(
        [_cli(), *args],
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if result.returncode not in (0, 2):  # 2 = findings met --fail-on, still valid JSON
        raise CiteSightError(f"cite-sight exited {result.returncode}: {result.stderr.strip()[:2000]}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise CiteSightError(f"cite-sight returned non-JSON output: {exc}") from exc


def check(
    paths: Iterable[str | Path],
    *,
    style: str | None = None,
    email: str | None = None,
    offline: bool = False,
    source_list: bool = False,
    fail_on: str | None = None,
    bibtex: str | None = None,
    timeout: float | None = None,
) -> dict[str, Any]:
    """Verify references in one or more documents. Returns the analysis JSON.

    The JSON shape matches the CLI: `references.verifications[]` with
    `status`, `flags`, `matchedWork`, `publicationCheck`, plus
    `crossReference` (orphan/near-match suggestions) and `detectedStyle`.
    """
    args = ["check", *[str(p) for p in paths], "--json"]
    if style:
        args += ["--style", style]
    if email:
        args += ["--email", email]
    if offline:
        args.append("--offline")
    if source_list:
        args.append("--source-list")
    if fail_on:
        args += ["--fail-on", fail_on]
    if bibtex:
        args += ["--bibtex", bibtex]
    return _run(args, timeout=timeout)


def claims(
    document: str | Path,
    sources_manifest: str | Path,
    *,
    model: str | None = None,
    runner: str | None = None,
    library: str | None = None,
    max_claims: int = 50,
    model_timeout: int = 180,
    output: str | None = None,
    timeout: float | None = None,
) -> dict[str, Any]:
    """Local claim-evidence review against mapped source files (experimental).

    Uses the managed runtime/model installed via
    `cite-sight setup-claims runtime` / `cite-sight setup-claims model <id>`
    unless explicit `model`/`runner` paths are given. Findings are labelled
    suggestions; quotations are verified against the source text.
    """
    args = ["claims", str(document), "--sources", str(sources_manifest), "--max-claims", str(max_claims), "--model-timeout", str(model_timeout)]
    if model:
        args += ["--model", model]
    if runner:
        args += ["--runner", runner]
    if library:
        args += ["--library", str(library)]
    if output:
        args += ["--output", str(output)]
    else:
        args += ["--json"]
    return _run(args, timeout=timeout)


def library_plan(
    paths: Iterable[str | Path],
    *,
    output: str | None = None,
    timeout: float | None = None,
) -> dict[str, Any]:
    """Common vs unique references across submissions — the coordinator's
    shopping list of sources to collect once per unit."""
    args = ["library", "plan", *[str(p) for p in paths]]
    if output:
        args += ["--output", str(output)]
    return _run(args, timeout=timeout)


def claim_overlap(report: str | Path, *, threshold: float = 0.6) -> dict[str, Any]:
    """Similar claims on shared references across submissions (a signal, not proof)."""
    result = subprocess.run(
        [_cli(), "claim-overlap", str(report), "--threshold", str(threshold)],
        capture_output=True, text=True,
    )
    return {"report": str(report), "output": result.stdout, "exit_code": result.returncode}


def about(topic: str | None = None) -> str:
    args = ["about"] + ([topic] if topic else [])
    result = subprocess.run([_cli(), *args], capture_output=True, text=True)
    return result.stdout
