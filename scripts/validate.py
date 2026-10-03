#!/usr/bin/env python3
"""Validate the skill package: frontmatter, referenced files, JSON, links, and the dist zip."""
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILL_DIR = ROOT / "real-estate-exec-brief"
ZIP_PATH = ROOT / "dist" / "real-estate-exec-brief.zip"
errors = []


def check_frontmatter():
    text = (SKILL_DIR / "SKILL.md").read_text(encoding="utf-8")
    match = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not match:
        errors.append("SKILL.md: missing YAML frontmatter")
        return text
    fields = dict(
        line.split(": ", 1) for line in match.group(1).splitlines() if ": " in line
    )
    name = fields.get("name", "")
    description = fields.get("description", "")
    if not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", name) or len(name) > 64:
        errors.append(f"SKILL.md: invalid name {name!r}")
    if name != SKILL_DIR.name:
        errors.append(f"SKILL.md: name {name!r} does not match folder {SKILL_DIR.name!r}")
    if not description or len(description) > 1024:
        errors.append(f"SKILL.md: description must be 1 to 1024 chars (got {len(description)})")
    return text


def check_referenced_files(skill_text):
    for ref in sorted(set(re.findall(r"`((?:references|examples|assets)/[^`*]+?)`", skill_text))):
        if not (SKILL_DIR / ref).exists():
            errors.append(f"SKILL.md references missing path: {ref}")


def check_json():
    for path in SKILL_DIR.rglob("*.json"):
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"{path.relative_to(ROOT)}: invalid JSON ({exc})")


def check_markdown_links():
    for md in [p for p in ROOT.rglob("*.md") if ".git" not in p.parts and "node_modules" not in p.parts]:
        for target in re.findall(r"\]\(([^)]+)\)", md.read_text(encoding="utf-8")):
            if target.startswith(("http://", "https://", "#", "mailto:")):
                continue
            if not (md.parent / target.split("#")[0]).exists():
                errors.append(f"{md.relative_to(ROOT)}: broken link {target}")


def check_zip():
    if not ZIP_PATH.exists():
        errors.append("dist zip missing: run scripts/build.sh")
        return
    source = {
        p.relative_to(ROOT).as_posix(): p.read_bytes()
        for p in SKILL_DIR.rglob("*")
        if p.is_file()
    }
    with zipfile.ZipFile(ZIP_PATH) as zf:
        packed = {n: zf.read(n) for n in zf.namelist() if not n.endswith("/")}
    if source != packed:
        stale = sorted(set(source) ^ set(packed)) or sorted(
            n for n in source if source[n] != packed.get(n)
        )
        errors.append(f"dist zip is stale ({', '.join(stale[:5])}): run scripts/build.sh")


skill_text = check_frontmatter()
check_referenced_files(skill_text)
check_json()
check_markdown_links()
check_zip()

if errors:
    print("Validation failed:")
    for err in errors:
        print(f"  - {err}")
    sys.exit(1)
print("Validation passed.")
