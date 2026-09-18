# citesight

Python wrapper for the [CiteSight](https://github.com/michael-borck/cite-sight) CLI —
citation verification and (experimental) local claim-evidence review for student work.

## Install

1. Node.js 20+, then: `npm install -g cite-sight`
2. This package: `pip install citesight` (or from this folder: `pip install .`)

## Use

```python
from cite_sight import check, library_plan, claim_overlap

result = check("essay.pdf", email="you@example.edu")
for v in result["references"]["verifications"]:
    print(v["status"], "—", v["reference"]["title"])

# Coordinator pass: common vs unique sources across a cohort
plan = library_plan(["submissions/*.pdf"], output="unit-sources.json")
```

Claim evidence review (experimental, local-only, requires
`cite-sight setup-claims runtime` + `model install`):

```python
from cite_sight import claims
result = claims("essay.pdf", "sources.json", library="./unit-readings/")
for f in result["claims"]["findings"]:
    print(f["status"], "—", f["claim"])
```

All functions shell out to the CLI and return parsed JSON — same verdicts as
the desktop app, no data leaves the machine beyond what the CLI itself sends
(reference metadata to open scholarly APIs; claim checking is fully offline).
