"""
Deterministic Secret-Leak Regression Guard & Mobile Credential Audit (ZS-002)
Target Concern:
Ensures no Android release keystores, mobile signing credentials, or private-key material
are tracked by Git or present in the repository, and that .gitignore and CI guard against recurrence.
"""

import os
import re
import subprocess
from pathlib import Path
from typing import List, Set
import pytest


def get_repo_root() -> Path:
    """Deterministically resolves the repository root directory."""
    try:
        output = subprocess.check_output(
            ["git", "rev-parse", "--show-toplevel"],
            stderr=subprocess.DEVNULL,
            text=True
        ).strip()
        if output:
            return Path(output).resolve()
    except Exception:
        pass

    # Fallback: search parent directories for .git marker
    current = Path(__file__).resolve().parent
    for parent in [current] + list(current.parents):
        if (parent / ".git").exists():
            return parent
    return Path(__file__).resolve().parent.parent


def get_tracked_files(repo_root: Path) -> List[str]:
    """Retrieves list of all Git-tracked files relative to repo root."""
    try:
        output = subprocess.check_output(
            ["git", "ls-files"],
            cwd=str(repo_root),
            stderr=subprocess.DEVNULL,
            text=True
        )
        return [f.strip() for f in output.splitlines() if f.strip()]
    except Exception as e:
        pytest.fail(f"Unable to execute git ls-files: {e}")


# ==============================================================================
# TEST A: TRACKED CREDENTIAL FILENAMES
# ==============================================================================

PROHIBITED_CREDENTIAL_EXTENSIONS = re.compile(
    r"\.(keystore|jks|p12|pfx|key|mobileprovision)$",
    re.IGNORECASE
)

def test_a_no_tracked_signing_credential_files():
    """
    Test A: Verify that no mobile signing credentials, Java keystores, PKCS#12 archives,
    or private-key files are tracked by Git.
    """
    repo_root = get_repo_root()
    tracked_files = get_tracked_files(repo_root)

    violations = []
    for rel_path in tracked_files:
        if PROHIBITED_CREDENTIAL_EXTENSIONS.search(rel_path):
            violations.append(rel_path)

    assert not violations, (
        f"Security Violation (ZS-002): Prohibited signing credential files tracked in Git: {violations}"
    )


# ==============================================================================
# TEST B: BINARY-SAFE PRIVATE PEM MATERIAL SCAN
# ==============================================================================

PRIVATE_KEY_MARKERS = [
    b"-----BEGIN PRIVATE KEY-----",
    b"-----BEGIN RSA PRIVATE KEY-----",
    b"-----BEGIN EC PRIVATE KEY-----",
    b"-----BEGIN OPENSSH PRIVATE KEY-----",
    b"-----BEGIN DSA PRIVATE KEY-----",
    b"-----BEGIN ENCRYPTED PRIVATE KEY-----",
]

EXEMPT_CONTENT_PATTERNS = [
    r"^tests/",
    r"\.example$",
    r"\.md$",
]

def test_b_no_private_key_material_in_tracked_files():
    """
    Test B: Binary-safe inspection of all tracked files for private-key markers.
    Scans files in binary mode without crashing on non-UTF8 or large blobs.
    Exempts test fixtures, template examples, and documentation per Section 10.
    Never prints matched secret contents.
    """
    repo_root = get_repo_root()
    tracked_files = get_tracked_files(repo_root)

    violations = []
    for rel_path in tracked_files:
        norm_path = rel_path.replace("\\", "/")
        if any(re.search(pat, norm_path) for pat in EXEMPT_CONTENT_PATTERNS):
            continue

        full_path = repo_root / rel_path
        if not full_path.is_file():
            continue

        try:
            with open(full_path, "rb") as f:
                content_chunk = f.read(1024 * 1024)
                for marker in PRIVATE_KEY_MARKERS:
                    if marker in content_chunk:
                        violations.append(rel_path)
                        break
        except (IOError, PermissionError):
            continue

    assert not violations, (
        f"Security Violation (ZS-002): Private-key material detected in tracked file(s): {violations}"
    )


# ==============================================================================
# TEST C: ANDROID SIGNING REFERENCES IN EXECUTABLE BUILD CONFIGURATIONS
# ==============================================================================

# Files exempt from rule C (documentation, security tests, and incident records)
EXEMPT_REFERENCE_PATTERNS = [
    r"^tests/test_secret_leak_guard\.py$",
    r"^MEMORY\.md$",
    r"^Z-SeHealth_project_features\.md$",
    r"^RULES\.md$",
    r"^\.gitignore$",
    r"\.md$",
]

HARDCODED_SIGNING_PATTERNS = [
    (re.compile(r"release\.keystore", re.IGNORECASE), "Committed release.keystore reference"),
    (re.compile(r"storePassword\s*=\s*['\"][^'\"\$]+['\"]", re.IGNORECASE), "Hardcoded storePassword"),
    (re.compile(r"keyPassword\s*=\s*['\"][^'\"\$]+['\"]", re.IGNORECASE), "Hardcoded keyPassword"),
    (re.compile(r"storeFile\s+file\(['\"][^'\"]*release\.keystore['\"]", re.IGNORECASE), "Hardcoded release.keystore storeFile"),
]

def test_c_no_hardcoded_signing_secrets_in_build_configs():
    """
    Test C: Verify that build scripts, CI workflows, and app configurations do not
    reference local committed keystores or embed plaintext store/key passwords.
    """
    repo_root = get_repo_root()
    tracked_files = get_tracked_files(repo_root)

    violations = []
    for rel_path in tracked_files:
        # Normalize slashes
        norm_path = rel_path.replace("\\", "/")
        if any(re.search(pat, norm_path) for pat in EXEMPT_REFERENCE_PATTERNS):
            continue

        full_path = repo_root / rel_path
        if not full_path.is_file():
            continue

        try:
            with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                for pattern, desc in HARDCODED_SIGNING_PATTERNS:
                    if pattern.search(content):
                        violations.append(f"{rel_path} ({desc})")
        except Exception:
            continue

    assert not violations, (
        f"Security Violation (ZS-002): Suspicious hardcoded signing references found: {violations}"
    )


# ==============================================================================
# TEST D: ROOT .gitignore PROTECTION
# ==============================================================================

MANDATORY_GITIGNORE_RULES = [
    r"\*\.keystore",
    r"\*\.jks",
    r"\*\.p12",
    r"\*\.pfx",
    r"\*\.key",
    r"\*\.pem",
    r"\*\.mobileprovision",
    r"release\.keystore",
    r"debug\.keystore",
]

def test_d_gitignore_covers_mobile_signing_credentials():
    """
    Test D: Verify that the root .gitignore explicitly blocks mobile signing credentials,
    keystores, private keys, and common local Android keystore names.
    """
    repo_root = get_repo_root()
    gitignore_path = repo_root / ".gitignore"

    assert gitignore_path.exists(), "Root .gitignore file is missing!"

    content = gitignore_path.read_text(encoding="utf-8")

    missing_rules = []
    for rule_pattern in MANDATORY_GITIGNORE_RULES:
        if not re.search(rule_pattern, content):
            missing_rules.append(rule_pattern)

    assert not missing_rules, (
        f"Configuration Defect: Root .gitignore is missing protective rules for: {missing_rules}"
    )


# ==============================================================================
# TEST E: KNOWN COMPROMISED ARTIFACT ABSENCE
# ==============================================================================

def test_e_known_compromised_artifact_completely_absent():
    """
    Test E: Specifically verifies that the compromised credential 'release.keystore'
    is neither tracked by Git nor present anywhere in the repository working tree.
    """
    repo_root = get_repo_root()
    tracked_files = get_tracked_files(repo_root)

    # 1. Must not be tracked
    tracked_matches = [f for f in tracked_files if Path(f).name.lower() == "release.keystore"]
    assert not tracked_matches, (
        f"P0 Critical Failure: Compromised 'release.keystore' is tracked in Git: {tracked_matches}"
    )

    # 2. Must not exist on disk in the repo
    on_disk_matches = list(repo_root.glob("**/release.keystore"))
    assert not on_disk_matches, (
        f"P0 Critical Failure: 'release.keystore' exists on disk: {[str(p.relative_to(repo_root)) for p in on_disk_matches]}"
    )
