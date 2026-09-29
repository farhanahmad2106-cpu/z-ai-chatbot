"""
FSSAI Authoritative Deterministic Additive Regulatory Resolution Engine

ARCHITECTURE
============
External (OCR / Open Food Facts / LLM) → raw candidates only
    ↓
Normalization
    ↓
Local registry resolution (INS code → canonical name → alias → embedded extraction)
    ↓
Deterministic regulatory status assignment
    ↓
Z-SeHealth application risk tier + penalty_points (NOT FSSAI statutory scores)
    ↓
Mandatory/statutory warning extraction
    ↓
Deduplication by canonical INS code
    ↓
Safety-score integration

REGULATORY BOUNDARY
====================
- This engine NEVER calls LLMs for regulatory classification decisions.
- This engine NEVER calls external APIs during resolution.
- This engine NEVER trusts Open Food Facts "risk" values as regulatory truth.
- This engine NEVER treats "unknown" as "safe".
- All regulatory determinations trace to the local fssai_master_additives.json
  dataset and its versioned provenance.

PENALTY TABLE
=============
These are Z-SeHealth heuristics, NOT FSSAI statutory penalties.
safe          = 0 points
moderate      = -5 points
high          = -18 points
restricted    = -18 points
hazardous     = -35 points
unclassified  = -2 points   ← UNKNOWN is NOT safe (penalty_points=-2)
"""

import hashlib
import json
import logging
import os
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

from schemas.fssai import (
    FSSAIAdditive,
    FSSAIResolutionResult,
    FSSAIRegulatoryStatus,
    ResolvedAdditive,
    ZSeHealthRiskTier,
)

logger = logging.getLogger("fssai_service")

# ---------------------------------------------------------------------------
# Immutable penalty table — Z-SeHealth application heuristics (NOT FSSAI law)
# ---------------------------------------------------------------------------
PENALTY_TABLE: Dict[str, int] = {
    "safe": 0,
    "moderate": -5,
    "high": -18,
    "restricted": -18,
    "hazardous": -35,
    "unclassified": -2,  # Unknown ≠ safe; unknown carries small negative signal
}

# ---------------------------------------------------------------------------
# Regulatory status → is_fssai_approved mapping
# ---------------------------------------------------------------------------
# True only for verified_permitted (and only conditionally — check
# regulatory_conditions before claiming unconditional approval).
# context_dependent, verified_restricted, verified_prohibited,
# not_verified, unknown → False.
_IS_APPROVED_MAP: Dict[str, bool] = {
    "verified_permitted": True,
    "verified_restricted": False,
    "verified_prohibited": False,
    "context_dependent": False,   # Approval depends on context — cannot claim universally
    "not_verified": False,
    "unknown": False,
}

# ---------------------------------------------------------------------------
# Dataset registry — loaded once at startup
# ---------------------------------------------------------------------------
MASTER_DATA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "fssai_master_additives.json"
)


class RegistryValidationError(Exception):
    """Raised when the FSSAI master dataset fails structural/integrity validation."""


# ---------------------------------------------------------------------------
# Normalization Engine
# ---------------------------------------------------------------------------

# Pre-compiled regex patterns for performance
_RE_WHITESPACE = re.compile(r"\s+")
_RE_INS_PREFIX = re.compile(
    r"^(?:ins\s*-?\s*|e\s*-?\s*|colour\s+|color\s+|additive\s+)(\d[\da-z\(\)]*)",
    re.IGNORECASE,
)
_RE_PURE_DIGITS = re.compile(r"^(\d{3,4})([a-z]|\([a-z]\)|\(i+\))?$", re.IGNORECASE)
_RE_EMBEDDED_INS = re.compile(
    r"\bINS\s*[\-\s]?(\d{3,4}[a-z]?(?:\([a-z]\)|\(i+\))?)\b",
    re.IGNORECASE,
)


def normalize_ins_code(raw: Optional[str]) -> Optional[str]:
    """
    Normalize an additive code / name fragment into canonical "INS NNN[x]" form.

    Handles:
        "INS 102", "INS102", "INS-102",
        "E102", "E-102", "E 102",
        "102", "102(i)", "102(ii)",
        "colour 102", "Color (102)", "Additive 102"

    Returns None if the token cannot be confidently resolved to a numeric INS code.
    Never guesses — if the form is ambiguous, returns None.
    """
    if not raw or not isinstance(raw, str):
        return None

    # 1. Unicode normalization + strip
    s = unicodedata.normalize("NFKC", raw).strip()
    if not s:
        return None

    # 2. Collapse whitespace
    s = _RE_WHITESPACE.sub(" ", s).strip()

    # 3. Lowercase for matching
    sl = s.lower()

    # 4. Try explicit INS/E/colour prefix extraction
    m = _RE_INS_PREFIX.match(sl)
    if m:
        digits = m.group(1).strip()
        # Normalize digits part
        digits = digits.replace(" ", "").replace("-", "")
        # Parentheses in roman numerals: normalise "(i)" → "(i)", "(ii)" → "(ii)"
        return f"INS {digits.upper()}"

    # 5. Try pure numeric (3–4 digits) with optional suffix
    m = _RE_PURE_DIGITS.match(sl.replace(" ", "").replace("-", ""))
    if m:
        numeric = m.group(1)
        suffix = (m.group(2) or "").strip()
        # Avoid mapping plain 2-digit numbers (they're not INS codes)
        if len(numeric) < 3:
            return None
        code = f"INS {numeric.upper()}{suffix.upper()}"
        return code

    # 6. Cannot normalize
    return None


def _extract_embedded_ins(text: str) -> List[str]:
    """
    Extract INS codes embedded inside arbitrary text.
    e.g., "contains INS 951 (Aspartame)" → ["INS 951"]
    """
    results = []
    for m in _RE_EMBEDDED_INS.finditer(text):
        code = f"INS {m.group(1).upper()}"
        if code not in results:
            results.append(code)
    return results


# ---------------------------------------------------------------------------
# Registry Loading and Validation
# ---------------------------------------------------------------------------

def _load_registry(path: str) -> Tuple[
    List[FSSAIAdditive],
    Dict[str, FSSAIAdditive],
    Dict[str, str],
    str,
]:
    """
    Load, validate, and index the FSSAI master additives registry.

    Returns:
        master_list: All FSSAIAdditive records
        by_ins_code: Dict[normalized_ins_code → FSSAIAdditive]
        by_alias:    Dict[alias_string → normalized_ins_code]
        dataset_version: Version string from metadata

    Raises RegistryValidationError on any integrity failure.
    FAIL CLOSED — never silently continue with partial data.
    """
    if not os.path.exists(path):
        raise RegistryValidationError(
            f"FSSAI master registry file not found at: {path}"
        )

    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = json.load(f)
    except json.JSONDecodeError as e:
        raise RegistryValidationError(
            f"FSSAI registry JSON parse error: {e}"
        ) from e

    if not isinstance(raw, dict):
        raise RegistryValidationError("FSSAI registry root must be a JSON object")

    dataset_version = raw.get("dataset_version", "unknown")
    entries_raw = raw.get("entries", raw.get("additives", []))

    if not isinstance(entries_raw, list) or len(entries_raw) == 0:
        raise RegistryValidationError(
            "FSSAI registry 'entries' must be a non-empty list"
        )

    seen_ins_codes: Dict[str, int] = {}
    seen_canonical_names: Dict[str, int] = {}
    seen_aliases: Dict[str, str] = {}
    master_list: List[FSSAIAdditive] = []
    by_ins_code: Dict[str, FSSAIAdditive] = {}
    by_alias: Dict[str, str] = {}

    valid_risk_tiers = set(ZSeHealthRiskTier.__args__)  # type: ignore[attr-defined]
    valid_reg_statuses = set(FSSAIRegulatoryStatus.__args__)  # type: ignore[attr-defined]

    errors: List[str] = []

    for idx, entry in enumerate(entries_raw):
        label = f"Entry[{idx}] ins_code={entry.get('ins_code', '?')}"

        # --- Required fields ---
        ins_raw = entry.get("ins_code", "")
        if not ins_raw:
            errors.append(f"{label}: Missing ins_code")
            continue

        canonical = entry.get("canonical_name", "")
        if not canonical:
            errors.append(f"{label}: Missing canonical_name")
            continue

        source_doc = entry.get("source_document", "")
        if not source_doc:
            errors.append(f"{label}: Missing source_document")

        # --- Normalize INS code for index ---
        # Registry codes may have roman suffix; normalize preserving them
        normalized_ins = ins_raw.strip().upper()
        if not normalized_ins.startswith("INS "):
            normalized_ins = f"INS {normalized_ins.replace('INS', '').strip()}"
        normalized_ins = _RE_WHITESPACE.sub(" ", normalized_ins).strip()

        # --- Duplicate INS check ---
        if normalized_ins in seen_ins_codes:
            errors.append(
                f"{label}: Duplicate INS code '{normalized_ins}' "
                f"(first seen at entry index {seen_ins_codes[normalized_ins]})"
            )
        else:
            seen_ins_codes[normalized_ins] = idx

        # --- Duplicate canonical name check ---
        cn_lower = canonical.lower().strip()
        if cn_lower in seen_canonical_names:
            errors.append(
                f"{label}: Duplicate canonical_name '{canonical}' "
                f"(first seen at entry index {seen_canonical_names[cn_lower]})"
            )
        else:
            seen_canonical_names[cn_lower] = idx

        # --- Risk tier / regulatory status validation ---
        # Support both new field name (zsehealth_risk_tier) and legacy (application_risk_tier)
        zsehealth_tier = entry.get("zsehealth_risk_tier") or entry.get("application_risk_tier", "")
        reg_status = entry.get("regulatory_status", "")

        if zsehealth_tier not in valid_risk_tiers:
            errors.append(
                f"{label}: Invalid zsehealth_risk_tier '{zsehealth_tier}'. "
                f"Valid: {sorted(valid_risk_tiers)}"
            )

        if reg_status not in valid_reg_statuses:
            errors.append(
                f"{label}: Invalid regulatory_status '{reg_status}'. "
                f"Valid: {sorted(valid_reg_statuses)}"
            )

        # --- Verified records must have provenance ---
        is_verified = entry.get("verified", False)
        if is_verified and not source_doc:
            errors.append(
                f"{label}: verified=true but source_document is missing — "
                "no record may be marked verified without provenance"
            )

        # --- ADI must not be negative ---
        adi = entry.get("adi_mg_per_kg_bw")
        if adi is not None and adi < 0:
            errors.append(f"{label}: adi_mg_per_kg_bw must be null or >= 0, got {adi}")

        # --- Build FSSAIAdditive model ---
        try:
            # Translate registry field names to schema field names
            # Support both old (application_risk_tier) and new (zsehealth_risk_tier) field names
            model_data = dict(entry)
            if "zsehealth_risk_tier" not in model_data and "application_risk_tier" in model_data:
                model_data["zsehealth_risk_tier"] = model_data["application_risk_tier"]
            if "zsehealth_risk_tier" in model_data:
                model_data["application_risk_tier"] = model_data["zsehealth_risk_tier"]

            # Map old registry fields to new schema fields
            if "food_category_restrictions" in model_data:
                # Merge into regulatory_conditions if regulatory_conditions absent
                existing_conditions = model_data.get("regulatory_conditions", [])
                extra = model_data.pop("food_category_restrictions", [])
                model_data["regulatory_conditions"] = list(set(existing_conditions + extra))

            if "banned_in_infant_foods" in model_data:
                banned = model_data.pop("banned_in_infant_foods", False)
                if banned:
                    prohibited = model_data.get("prohibited_food_categories", [])
                    if "foods_for_infants_and_young_children" not in prohibited:
                        model_data["prohibited_food_categories"] = prohibited + [
                            "foods_for_infants_and_young_children"
                        ]

            if "schedule_reference" in model_data and "fssai_schedule_reference" not in model_data:
                model_data["fssai_schedule_reference"] = model_data.pop("schedule_reference")
            elif "schedule_reference" in model_data:
                model_data.pop("schedule_reference", None)

            if "source_version_or_date" in model_data and "source_amendment" not in model_data:
                model_data.setdefault("source_amendment", None)

            if "verification_status" not in model_data:
                ver = model_data.get("verified", False)
                model_data["verification_status"] = "verified" if ver else "unverified"

            # Remove unknown fields that Pydantic would reject
            known_fields = set(FSSAIAdditive.model_fields.keys())
            model_data = {k: v for k, v in model_data.items() if k in known_fields}

            additive = FSSAIAdditive(**model_data)

        except Exception as e:
            errors.append(f"{label}: Pydantic model construction failed: {e}")
            continue

        master_list.append(additive)
        by_ins_code[normalized_ins] = additive

        # --- Build alias index ---
        # Index: INS variants → normalized_ins
        for alias_variant in [
            normalized_ins,                              # "INS 102"
            normalized_ins.replace("INS ", ""),         # "102"
            normalized_ins.replace("INS ", "E"),        # "E102"
            normalized_ins.replace("INS ", "E-"),       # "E-102"
        ]:
            key = alias_variant.lower().strip()
            if key in seen_aliases and seen_aliases[key] != normalized_ins:
                errors.append(
                    f"{label}: Alias collision '{key}' already mapped to "
                    f"'{seen_aliases[key]}', attempted remapping to '{normalized_ins}'"
                )
            elif key not in seen_aliases:
                seen_aliases[key] = normalized_ins
                by_alias[key] = normalized_ins

        # Canonical name
        cn_key = canonical.lower().strip()
        if cn_key not in by_alias:
            by_alias[cn_key] = normalized_ins
            seen_aliases[cn_key] = normalized_ins

        # User-defined aliases from registry
        for alias in additive.aliases:
            if not alias:
                continue
            akey = alias.lower().strip()
            if akey in seen_aliases and seen_aliases[akey] != normalized_ins:
                errors.append(
                    f"{label}: Alias collision '{akey}' already mapped to "
                    f"'{seen_aliases[akey]}', attempted remapping to '{normalized_ins}'"
                )
            else:
                seen_aliases[akey] = normalized_ins
                by_alias[akey] = normalized_ins

    if errors:
        error_msg = (
            f"FSSAI registry validation failed with {len(errors)} error(s). "
            f"Startup aborted to prevent deployment with corrupt regulatory data.\n"
            + "\n".join(f"  - {e}" for e in errors[:20])
        )
        if len(errors) > 20:
            error_msg += f"\n  ... and {len(errors) - 20} more errors."
        raise RegistryValidationError(error_msg)

    logger.info(
        "[FSSAI] Registry loaded: %d records, %d alias keys, version=%s",
        len(master_list),
        len(by_alias),
        dataset_version,
    )
    return master_list, by_ins_code, by_alias, dataset_version


# ---------------------------------------------------------------------------
# FSSAIRegulatoryService
# ---------------------------------------------------------------------------

class FSSAIRegulatoryService:
    """
    Authoritative deterministic FSSAI additive regulatory resolution service.

    Lifecycle:
        1. Instantiate once at application startup.
        2. _load_and_validate() is called in __init__.
        3. All resolution calls are read-only against immutable indexes.
        4. No external network calls are ever made during resolution.
        5. No LLM is ever consulted for regulatory classification.

    Thread/async safety:
        All public methods are read-only. The indexes are set once and
        never mutated after __init__ completes. Safe for concurrent FastAPI requests.
    """

    def __init__(self) -> None:
        self._master_list: List[FSSAIAdditive] = []
        self._by_ins_code: Dict[str, FSSAIAdditive] = {}
        self._by_alias: Dict[str, str] = {}
        self._dataset_version: str = "unknown"
        self._registry_checksum: str = "uncomputed"
        self._load_and_validate()

    # ------------------------------------------------------------------
    # Internal: load + build indexes
    # ------------------------------------------------------------------

    def _load_and_validate(self) -> None:
        path = os.path.normpath(MASTER_DATA_PATH)
        self._master_list, self._by_ins_code, self._by_alias, self._dataset_version = (
            _load_registry(path)
        )
        self._registry_checksum = self._compute_checksum(path)
        logger.info(
            "[FSSAI] Service ready. version=%s checksum=%s",
            self._dataset_version,
            self._registry_checksum[:12],
        )

    @staticmethod
    def _compute_checksum(path: str) -> str:
        """
        Compute a deterministic SHA-256 hash of the canonical JSON registry.
        Provides production diagnostic confirmation of which exact dataset is loaded.
        """
        try:
            with open(path, "r", encoding="utf-8") as f:
                raw = json.load(f)
            # Canonicalize: sort keys recursively
            canonical = json.dumps(raw, sort_keys=True, ensure_ascii=True)
            return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        except Exception as e:
            logger.warning("[FSSAI] Could not compute registry checksum: %s", e)
            return "checksum_error"

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    @property
    def dataset_version(self) -> str:
        return self._dataset_version

    @property
    def registry_checksum(self) -> str:
        return self._registry_checksum

    @property
    def record_count(self) -> int:
        return len(self._master_list)

    def get_by_ins_code(self, ins_code: str) -> Optional[FSSAIAdditive]:
        """O(1) lookup by normalized INS code."""
        key = ins_code.strip().upper()
        if not key.startswith("INS "):
            key = f"INS {key.replace('INS', '').strip()}"
        return self._by_ins_code.get(key)

    def get_by_alias(self, alias: str) -> Optional[FSSAIAdditive]:
        """O(1) lookup by alias, canonical name, or any normalized variant."""
        ins_code = self._by_alias.get(alias.lower().strip())
        if ins_code:
            return self._by_ins_code.get(ins_code)
        return None

    def normalize_ins_code(self, raw: str) -> Optional[str]:
        """Delegate to module-level normalization function."""
        return normalize_ins_code(raw)

    # ------------------------------------------------------------------
    # Core Resolution
    # ------------------------------------------------------------------

    def resolve_additive(self, raw: Any) -> ResolvedAdditive:
        """
        Resolve a single raw additive candidate (string or dict) against the
        local FSSAI registry using a 4-priority resolution chain:

          1. Exact normalized INS code match
          2. Canonical name match
          3. Alias match (any registered variant)
          4. Embedded INS code extraction from text

        Returns a ResolvedAdditive. Never returns a match with fabricated data.
        Unknown additives → regulatory_status="unknown", penalty_points=-2.
        """
        # --- Normalize raw input ---
        input_code: Optional[str] = None
        input_name: Optional[str] = None

        if isinstance(raw, dict):
            input_code = raw.get("code") or raw.get("ins_code")
            input_name = raw.get("name") or raw.get("canonical_name")
        elif isinstance(raw, str):
            raw = raw.strip()
            # Heuristic: if it contains a digit or starts with INS/E, treat as code
            if re.search(r"\d", raw):
                input_code = raw
            else:
                input_name = raw
        else:
            return self._make_unresolved(str(raw), None)

        # --- Priority 1: INS code resolution ---
        if input_code:
            normalized = normalize_ins_code(input_code)
            if normalized:
                # Try exact index
                match = self._by_ins_code.get(normalized)
                if match:
                    return self._make_resolved(
                        match, input_code, input_name, normalized, "ins_code"
                    )
                # Try alias index with the code's digit variants
                for variant in [
                    normalized,
                    normalized.replace("INS ", "").strip(),
                    normalized.replace("INS ", "E").strip(),
                    normalized.replace("INS ", "E-").strip(),
                ]:
                    alias_target = self._by_alias.get(variant.lower().strip())
                    if alias_target and alias_target in self._by_ins_code:
                        match = self._by_ins_code[alias_target]
                        return self._make_resolved(
                            match, input_code, input_name, normalized, "ins_code"
                        )

        # --- Priority 2: Canonical name match ---
        for candidate in [n for n in [input_name, input_code] if n]:
            canon_key = candidate.strip().lower()
            alias_ins = self._by_alias.get(canon_key)
            if alias_ins and alias_ins in self._by_ins_code:
                match = self._by_ins_code[alias_ins]
                return self._make_resolved(
                    match, input_code, input_name, match.ins_code, "canonical_name"
                )

        # --- Priority 3: Alias match (careful normalization only) ---
        for candidate in [n for n in [input_name, input_code] if n]:
            # Try the normalized form of the candidate
            normalized_candidate = normalize_ins_code(candidate)
            if normalized_candidate:
                alias_ins = self._by_alias.get(normalized_candidate.lower().strip())
                if alias_ins and alias_ins in self._by_ins_code:
                    match = self._by_ins_code[alias_ins]
                    return self._make_resolved(
                        match, input_code, input_name, normalized_candidate, "alias"
                    )
            # Also try direct alias lookup on the candidate text
            alias_ins = self._by_alias.get(candidate.strip().lower())
            if alias_ins and alias_ins in self._by_ins_code:
                match = self._by_ins_code[alias_ins]
                return self._make_resolved(
                    match, input_code, input_name, match.ins_code, "alias"
                )

        # --- Priority 4: Embedded INS extraction from text ---
        for candidate in [n for n in [input_name, input_code] if n]:
            embedded = _extract_embedded_ins(candidate)
            for emb_code in embedded:
                match = self._by_ins_code.get(emb_code)
                if match:
                    return self._make_resolved(
                        match, input_code, input_name, emb_code, "alias"
                    )

        # --- Unresolved ---
        raw_str = str(input_code or input_name or raw)
        normalized_attempt = normalize_ins_code(raw_str) if raw_str else None
        return self._make_unresolved(raw_str, normalized_attempt)

    def resolve_additives(self, raw_additives: List[Any]) -> List[ResolvedAdditive]:
        """
        Resolve a list of raw additive candidates.
        Returns one ResolvedAdditive per input element.
        """
        return [self.resolve_additive(item) for item in raw_additives]

    # ------------------------------------------------------------------
    # Aggregation: Penalty + Warnings
    # ------------------------------------------------------------------

    def calculate_penalty(self, resolved_additives: List[ResolvedAdditive]) -> int:
        """
        Sum penalty_points across the resolved list.
        Deduplication is expected to have already been applied.
        """
        return sum(a.penalty_points for a in resolved_additives)

    def collect_mandatory_warnings(
        self, resolved_additives: List[ResolvedAdditive]
    ) -> List[str]:
        """
        Collect and deduplicate mandatory/statutory warnings from resolved additives.
        Warnings originate from the local registry only — never from LLM output.
        """
        seen: set = set()
        warnings: List[str] = []
        for additive in resolved_additives:
            if additive.mandatory_warning and additive.mandatory_warning not in seen:
                seen.add(additive.mandatory_warning)
                warnings.append(additive.mandatory_warning)
            for w in additive.warnings:
                if w and w not in seen:
                    seen.add(w)
                    warnings.append(w)
        return sorted(warnings)

    def calculate_food_safety_score(
        self,
        resolved_additives: List[ResolvedAdditive],
        other_penalties: List[int],
    ) -> int:
        """
        Compute overall Z-SeHealth food safety score.

        Score = 100 + additive_penalty + other_penalties
        Clamped to [1, 100].

        IMPORTANT: This is a Z-SeHealth application score, not an FSSAI statutory rating.
        """
        total = 100 + self.calculate_penalty(resolved_additives) + sum(other_penalties)
        return max(1, min(100, total))

    # ------------------------------------------------------------------
    # Unified pipeline: resolve + deduplicate
    # ------------------------------------------------------------------

    def resolve_and_deduplicate(
        self,
        detected_additives: List[Any],
        parsed_ingredients: List[str],
    ) -> Tuple[List[ResolvedAdditive], List[str]]:
        """
        Full deterministic pipeline:
          1. Resolve all detected additives (from OCR / Open Food Facts tags).
          2. Scan parsed_ingredients text for embedded INS codes.
          3. Deduplicate by canonical normalized INS code.
          4. Collect mandatory/statutory warnings.

        Returns:
            resolved_additives: Deduplicated list of ResolvedAdditive
            all_warnings:       Sorted, deduplicated warning strings

        NEVER trusts Open Food Facts "risk" values or LLM-generated risk fields.
        """
        all_resolved: List[ResolvedAdditive] = []

        # Step 1: Resolve detected additives
        for item in (detected_additives or []):
            resolved = self.resolve_additive(item)
            all_resolved.append(resolved)

        # Step 2: Scan ingredients text for embedded INS codes
        for ingredient in (parsed_ingredients or []):
            if not isinstance(ingredient, str):
                continue
            embedded = _extract_embedded_ins(ingredient)
            for code in embedded:
                match = self._by_ins_code.get(code)
                if match:
                    resolved = self._make_resolved(
                        match, code, None, code, "ins_code"
                    )
                    all_resolved.append(resolved)

        # Step 3: Deduplicate by canonical INS code
        seen_ins: set = set()
        deduped: List[ResolvedAdditive] = []
        unresolved_dedup: set = set()

        for r in all_resolved:
            dedup_key = r.normalized_ins_code or f"__unresolved__{(r.input_code or r.input_name or '').lower()}"
            if dedup_key not in seen_ins:
                seen_ins.add(dedup_key)
                deduped.append(r)
            elif r.normalized_ins_code is None:
                # For unresolved, track by raw input
                raw_key = (r.input_code or r.input_name or "").lower()
                if raw_key not in unresolved_dedup:
                    unresolved_dedup.add(raw_key)
                    deduped.append(r)

        # Step 4: Collect warnings
        all_warnings = self.collect_mandatory_warnings(deduped)

        return deduped, all_warnings

    # ------------------------------------------------------------------
    # Dataset validation (callable from tests)
    # ------------------------------------------------------------------

    def validate_dataset(self) -> bool:
        """
        Re-validate the loaded dataset. Returns True if valid.
        Raises RegistryValidationError if validation fails.
        Called from tests to assert dataset integrity.
        """
        _load_registry(os.path.normpath(MASTER_DATA_PATH))
        return True

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _make_resolved(
        self,
        match: FSSAIAdditive,
        input_code: Optional[str],
        input_name: Optional[str],
        normalized_ins: Optional[str],
        method: str,
    ) -> ResolvedAdditive:
        """Construct a ResolvedAdditive from a registry match."""
        reg_status: FSSAIRegulatoryStatus = match.regulatory_status  # type: ignore[assignment]
        zsehealth_tier: ZSeHealthRiskTier = match.zsehealth_risk_tier  # type: ignore[assignment]
        penalty = PENALTY_TABLE.get(zsehealth_tier, -2)
        is_approved = _IS_APPROVED_MAP.get(reg_status, False)

        warnings: List[str] = []
        if match.mandatory_warning:
            warnings.append(match.mandatory_warning)

        return ResolvedAdditive(
            input_code=input_code,
            input_name=input_name,
            normalized_ins_code=normalized_ins or match.ins_code,
            canonical_name=match.canonical_name,
            matched=True,
            match_method=method,  # type: ignore[arg-type]
            fssai_regulatory_status=reg_status,
            regulatory_status=reg_status,
            zsehealth_risk_tier=zsehealth_tier,
            application_risk_tier=zsehealth_tier,
            is_fssai_approved=is_approved,
            penalty_points=penalty,
            functional_classes=match.functional_classes,
            adi_mg_per_kg_bw=match.adi_mg_per_kg_bw,
            mandatory_warning=match.mandatory_warning,
            regulatory_conditions=match.regulatory_conditions,
            warnings=warnings,
            requires_review=(reg_status in ("not_verified", "context_dependent")),
            provenance={
                "source_authority": match.source_authority,
                "source_document": match.source_document,
                "source_amendment": match.source_amendment,
                "source_version_or_date": match.source_version_or_date,
                "verification_status": match.verification_status,
                "last_verified_at": match.last_verified_at,
                "dataset_version": self._dataset_version,
            },
        )

    def _make_unresolved(
        self,
        raw_str: str,
        normalized_attempt: Optional[str],
    ) -> ResolvedAdditive:
        """
        Construct an unresolved ResolvedAdditive.
        Unknown ≠ Safe. penalty_points = -2.
        regulatory_review_required is implicitly True via requires_review.
        """
        return ResolvedAdditive(
            input_code=raw_str if re.search(r"\d", raw_str) else None,
            input_name=raw_str if not re.search(r"\d", raw_str) else None,
            normalized_ins_code=normalized_attempt,
            canonical_name=None,
            matched=False,
            match_method="unmatched",
            fssai_regulatory_status="unknown",
            regulatory_status="unknown",
            zsehealth_risk_tier="unclassified",
            application_risk_tier="unclassified",
            is_fssai_approved=False,
            penalty_points=PENALTY_TABLE["unclassified"],  # -2
            functional_classes=[],
            adi_mg_per_kg_bw=None,
            mandatory_warning=None,
            regulatory_conditions=[],
            warnings=[
                f"Additive '{raw_str}' could not be resolved in the FSSAI registry. "
                "Manual regulatory review is recommended."
            ],
            requires_review=True,
            provenance={
                "source_authority": None,
                "source_document": None,
                "dataset_version": self._dataset_version,
                "resolution_note": "Not found in local FSSAI registry",
            },
        )


# ---------------------------------------------------------------------------
# Module-level singleton — loaded at import time (FastAPI startup)
# ---------------------------------------------------------------------------

try:
    fssai_resolver = FSSAIRegulatoryService()
except RegistryValidationError as _e:
    # Re-raise: application must not start with a corrupt regulatory dataset
    raise RuntimeError(
        f"FSSAI regulatory service failed to start. "
        f"Registry validation errors must be fixed before deployment.\n{_e}"
    ) from _e
except Exception as _e:
    raise RuntimeError(
        f"Unexpected error during FSSAI regulatory service initialization: {_e}"
    ) from _e
