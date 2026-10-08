"""Tests for the CiteSight Python wrapper (stdlib unittest, no dependencies).

Mocks subprocess.run so no CLI install is needed.
Run: python3 -m unittest discover -s packages/python -p 'test_*.py'
"""
from __future__ import annotations

import json
import os
import unittest
from unittest import mock

from cite_sight import (
    CiteSightError,
    _run,
    check,
    claims,
    is_cli_available,
    run,
)

FAKE_JSON = {"ok": True}


class FakeCompleted:
    def __init__(self, returncode=0, stdout="", stderr=""):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr


def make_cli_available(value="/fake/bin/cite-sight"):
    return mock.patch("shutil.which", return_value=value)


class CheckArgsTest(unittest.TestCase):
    """Regression tests for check() argument building (crashed with
    NameError when screenshots/extra_args handling was added without
    the matching parameters)."""

    def _captured(self, fn, *args, **kwargs):
        with make_cli_available(), mock.patch(
            "subprocess.run",
            return_value=FakeCompleted(returncode=0, stdout=json.dumps(FAKE_JSON)),
        ) as mocked:
            result = fn(*args, **kwargs)
        self.assertEqual(result, FAKE_JSON)
        return mocked.call_args[0][0]

    def test_minimal_call_does_not_crash(self):
        argv = self._captured(check, "essay.pdf")
        self.assertEqual(argv, ["/fake/bin/cite-sight", "check", "essay.pdf", "--json"])

    def test_path_list_expansion(self):
        argv = self._captured(check, ["a.pdf", "b.docx"])
        self.assertIn("a.pdf", argv)
        self.assertIn("b.docx", argv)
        self.assertNotIn("--json", argv[:4])

    def test_all_flags(self):
        argv = self._captured(
            check,
            ["papers/"],
            style="apa",
            email="lecturer@example.edu",
            offline=True,
            source_list=True,
            fail_on="suspicious",
            bibtex="refs.bib",
        )
        for expected in (
            ["--style", "apa"],
            ["--email", "lecturer@example.edu"],
            ["--offline"],
            ["--source-list"],
            ["--fail-on", "suspicious"],
            ["--bibtex", "refs.bib"],
        ):
            self.assertIn(expected[0], argv)
            if len(expected) > 1:
                self.assertEqual(argv[argv.index(expected[0]) + 1], expected[1])

    def test_screenshots_flag(self):
        argv = self._captured(check, "essay.pdf", screenshots=True)
        self.assertIn("--screenshots", argv)

    def test_no_screenshots_by_default(self):
        argv = self._captured(check, "essay.pdf")
        self.assertNotIn("--screenshots", argv)

    def test_extra_args_passthrough(self):
        argv = self._captured(
            check, "essay.pdf", extra_args=["--verbose", "--output", "reports/"]
        )
        self.assertEqual(argv[-4:], ["--json", "--verbose", "--output", "reports/"])


class ErrorHandlingTest(unittest.TestCase):
    def test_nonzero_exit_raises(self):
        with make_cli_available(), mock.patch(
            "subprocess.run",
            return_value=FakeCompleted(returncode=1, stderr="boom"),
        ):
            with self.assertRaises(CiteSightError):
                check("essay.pdf")

    def test_exit_code_two_is_findings_not_error(self):
        with make_cli_available(), mock.patch(
            "subprocess.run",
            return_value=FakeCompleted(returncode=2, stdout=json.dumps(FAKE_JSON)),
        ):
            self.assertEqual(check("essay.pdf"), FAKE_JSON)

    def test_non_json_stdout_raises(self):
        with make_cli_available(), mock.patch(
            "subprocess.run",
            return_value=FakeCompleted(returncode=0, stdout="not json"),
        ):
            with self.assertRaises(CiteSightError):
                check("essay.pdf")


class RunTest(unittest.TestCase):
    def test_parses_json(self):
        with make_cli_available(), mock.patch(
            "subprocess.run",
            return_value=FakeCompleted(stdout=json.dumps(FAKE_JSON)),
        ):
            self.assertEqual(run(["manifest"]), FAKE_JSON)

    def test_raw_text_mode(self):
        with make_cli_available(), mock.patch(
            "subprocess.run",
            return_value=FakeCompleted(stdout="hello"),
        ):
            self.assertEqual(run(["about"], as_json=False), "hello")

    def test_invalid_json_falls_back_to_text(self):
        with make_cli_available(), mock.patch(
            "subprocess.run",
            return_value=FakeCompleted(stdout="hello"),
        ):
            self.assertEqual(run(["about"]), "hello")


class ClaimsTest(unittest.TestCase):
    def test_defaults_add_json(self):
        with make_cli_available(), mock.patch(
            "subprocess.run",
            return_value=FakeCompleted(returncode=0, stdout=json.dumps(FAKE_JSON)),
        ) as mocked:
            claims("essay.pdf", "sources.json")
        argv = mocked.call_args[0][0]
        self.assertIn("--json", argv)
        self.assertIn("--max-claims", argv)
        self.assertEqual(argv[argv.index("--max-claims") + 1], "50")

    def test_output_mode_omits_json(self):
        with make_cli_available(), mock.patch(
            "subprocess.run",
            return_value=FakeCompleted(returncode=0, stdout=json.dumps(FAKE_JSON)),
        ) as mocked:
            claims("essay.pdf", "sources.json", output="out.json")
        argv = mocked.call_args[0][0]
        self.assertNotIn("--json", argv)
        self.assertIn("out.json", argv)


class AvailabilityTest(unittest.TestCase):
    def test_env_override(self):
        with mock.patch.dict(os.environ, {"CITESIGHT_CLI": "/custom/cli"}):
            self.assertTrue(is_cli_available())

    def test_missing_cli(self):
        with mock.patch.dict(os.environ, {}, clear=True), mock.patch(
            "shutil.which", return_value=None
        ):
            self.assertFalse(is_cli_available())

    def test_missing_cli_raises_with_instructions(self):
        with mock.patch.dict(os.environ, {}, clear=True), mock.patch(
            "shutil.which", return_value=None
        ):
            with self.assertRaises(CiteSightError) as ctx:
                check("essay.pdf")
            self.assertIn("npm install -g cite-sight", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
