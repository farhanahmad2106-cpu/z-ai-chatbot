"""
FSSAI Deterministic Regulatory Resolution Service

ARCHITECTURE:
  OCR/Open Food Facts → raw candidates only → normalization → local registry → resolution → risk tier → penalty

INVARIANTS:
  1. LLMs may extract candidate additive names/codes. They MUST NOT classify safety.
  2. Open Food Facts may provide candidate product data. It is NOT authoritative for FSSAI.
  3. Application penalty values are Z-SeHealth heuristics, NOT official FSSAI scores.
  4. Unknown ≠ Hazardous. Unresolved additives become "unclassified" + requires_review=True.
  5. Registry failures FAIL CLOSED. The service raises on startup if the registry is corrupt.
  6. Registry is loaded once, cached immutably. O(1) lookup by INS code, name, or alias.
  7. No LLM, no network call, no randomness participates in regulatory resolution.
"""
import json
import logging
import os
import re
from typing import Dict, List, Optional, Set, Tuple

from schemas.fssai import FSSAIAdditive, ResolvedAdditive

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Application-level penalty table — NOT official FSSAI scoring values.
# These are Z-SeHealth heuristics for product safety scoring.
# ---------------------------------------------------------------------------
PENALTY_TABLE: Dict[str, int] = {
    "safe":         0,
    "moderate":    -5,
    "high":       -18,
    "restricted": -18,
    "hazardous":  -35,
    "unclassified": 0,   # Unknown ≠ Hazardous — no false penalty
}


class RegistryValidationError(Exception):
    """Raised when the FSSAI registry fails structural/integrity validation at startup."""
    pass


class FSSAIRegulatoryService:
    """
    Deterministic, fail-closed FSSAI additive resolution engine.

    Loads fssai_master_additives.json once, validates structural integrity,
    builds normalized O(1) lookup tables, and resolves additives without
    any LLM, network, or probabilistic input.
    """

    def __init__(self):
        self.registry: Dict[str, FSSAIAdditive] = {}       # INS code → record
        self.by_canonical_name: Dict[str, FSSAIAdditive] = {}
        self.by_alias: Dict[str, FSSAIAdditive] = {}
        self.metadata: Dict = {}
        self._load_and_validate_registry()

    # -----------------------------------------------------------------------
    # Registry loading & validation
    # -----------------------------------------------------------------------

    def _load_and_validate_registry(self):
        """Load, parse, validate, and index the FSSAI master registry. Fail closed on any error."""
        filepath = os.path.join(os.path.dirname(__file__), "..", "data", "fssai_master_additives.json")
        filepath = os.path.normpath(filepath)

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
        except FileNotFoundError:
            raise RegistryValidationError(
                f"FSSAI registry not found at {filepath}. "
                "Cannot start without an authoritative additive registry."
            )
        except json.JSONDecodeError as e:
            raise RegistryValidationError(f"FSSAI registry is malformed JSON: {e}")

        self.metadata = data.get("registry_metadata", {})
        additives_raw = data.get("additives", [])

        if not additives_raw:
            raise RegistryValidationError("FSSAI registry contains 0 additive records. Cannot start.")

        # Validation accumulators
        seen_ins: Dict[str, str] = {}          # norm_ins → canonical_name
        seen_aliases: Dict[str, str] = {}      # norm_alias → owning INS code
        errors: List[str] = []

        for idx, item in enumerate(additives_raw):
            # Parse through Pydantic — catches invalid types, missing fields, bad enums
            try:
                additive = FSSAIAdditive(**item)
            except Exception as e:
                errors.append(f"Record {idx}: Pydantic validation failed — {e}")
                continue

            # Validate INS code format
            norm_ins = self.normalize_ins_code(additive.ins_code)
            if not norm_ins:
                errors.append(f"Record {idx} ({additive.canonical_name}): Malformed INS code '{additive.ins_code}'")
                continue

            # Validate canonical name
            if not additive.canonical_name or not additive.canonical_name.strip():
                errors.append(f"Record {idx}: Missing canonical_name")
                continue

            # Validate ADI — must be positive or None
            if additive.adi_mg_per_kg_bw is not None and additive.adi_mg_per_kg_bw < 0:
                errors.append(f"Record {idx} ({additive.canonical_name}): Negative ADI {additive.adi_mg_per_kg_bw}")
                continue

            # Validate provenance — warn but don't fail
            if not additive.source_authority:
                errors.append(f"Record {idx} ({additive.canonical_name}): Missing source_authority (provenance)")
                continue

            # Check for duplicate INS codes
            if norm_ins in seen_ins:
                errors.append(
                    f"Record {idx}: Duplicate INS code {norm_ins} — "
                    f"already assigned to '{seen_ins[norm_ins]}', conflict with '{additive.canonical_name}'"
                )
                continue

            seen_ins[norm_ins] = additive.canonical_name
            self.registry[norm_ins] = additive

            # Index canonical name
            norm_name = self._normalize_name(additive.canonical_name)
            self.by_canonical_name[norm_name] = additive

            # Index aliases — check for collisions
            for alias in additive.aliases:
                norm_alias = self._normalize_name(alias)
                if not norm_alias:
                    continue
                if norm_alias in seen_aliases and seen_aliases[norm_alias] != norm_ins:
                    errors.append(
                        f"Record {idx} ({additive.canonical_name}): Alias '{alias}' (normalized: '{norm_alias}') "
                        f"already claimed by INS {seen_aliases[norm_alias]}"
                    )
                    continue
                seen_aliases[norm_alias] = norm_ins
                self.by_alias[norm_alias] = additive

        if errors:
            raise RegistryValidationError(
                f"FSSAI registry validation failed with {len(errors)} error(s):\n" +
                "\n".join(f"  - {e}" for e in errors)
            )

        logger.info(
            "FSSAI registry loaded: %d additives, %d aliases, version=%s",
            len(self.registry), len(self.by_alias),
            self.metadata.get("dataset_version", "unknown")
        )

    # -----------------------------------------------------------------------
    # Normalization
    # -----------------------------------------------------------------------

    @staticmethod
    def normalize_ins_code(code: str) -> Optional[str]:
        """
        Normalize INS/E-number codes to canonical 'INS XXX' form.

        Handles:
            INS 102, INS-102, E 102, E-102, E102, 102, ins 102
            INS 500(ii), E500(ii), 500(ii)
            INS 150c, E150c, 150C

        Does NOT interpret arbitrary strings as INS codes.
        Returns None if the input doesn't match an additive code pattern.
        """
        if not code or not code.strip():
            return None

        cleaned = code.strip().upper()

        # Match patterns:  optional prefix (INS/E/E-)  +  digits  +  optional alpha suffix  +  optional (roman) suffix
        # Examples: E102, INS-102, 102, 500(ii), 150C, 150D
        match = re.match(
            r'^(?:INS[\s\-]*|E[\s\-]*)?' +    # optional prefix
            r'(\d{2,4})'  +                      # 2-4 digit code (mandatory)
            r'([A-Z]?)'  +                        # optional single-letter suffix like C, D
            r'(\([IVXivx]+\))?'  +                # optional parenthesized roman numeral suffix
            r'$',
            cleaned
        )
        if not match:
            return None

        number = match.group(1)
        letter_suffix = match.group(2) or ""
        roman_suffix = (match.group(3) or "").upper()

        return f"INS {number}{letter_suffix}{roman_suffix}"

    @staticmethod
    def _normalize_name(name: str) -> str:
        """Normalize an additive name/alias for case-insensitive exact matching."""
        if not name:
            return ""
        # Lowercase, strip non-alphanumeric (except spaces), collapse whitespace
        cleaned = re.sub(r'[^\w\s]', '', name.lower())
        return re.sub(r'\s+', ' ', cleaned).strip()

    # -----------------------------------------------------------------------
    # Resolution
    # -----------------------------------------------------------------------

    def resolve_additive_safety(self, raw_code: Optional[str], additive_name: Optional[str]) -> ResolvedAdditive:
        """
        Resolve a raw additive observation against the local FSSAI registry.

        Resolution priority:
          1. Normalized INS code match
          2. Canonical name match
          3. Alias match
          4. INS code extraction from name string (e.g. "Tartrazine (102)")
          5. Unresolved → unclassified + requires_review

        No LLM, no network call, no randomness.
        """
        norm_ins = self.normalize_ins_code(raw_code or "")
        norm_name = self._normalize_name(additive_name or "")

        match: Optional[FSSAIAdditive] = None
        match_method = "unmatched"

        # 1. INS code match
        if norm_ins and norm_ins in self.registry:
            match = self.registry[norm_ins]
            match_method = "ins_code"

        # 2. Canonical name match
        elif norm_name and norm_name in self.by_canonical_name:
            match = self.by_canonical_name[norm_name]
            match_method = "canonical_name"

        # 3. Alias match
        elif norm_name and norm_name in self.by_alias:
            match = self.by_alias[norm_name]
            match_method = "alias"

        # 4. Fallback: extract INS code embedded in name string
        elif additive_name:
            extracted_ins = self.normalize_ins_code(additive_name)
            if extracted_ins and extracted_ins in self.registry:
                match = self.registry[extracted_ins]
                match_method = "ins_code"

        if match:
            warnings = []
            if match.mandatory_warning:
                warnings.append(match.mandatory_warning)
            if match.food_category_restrictions:
                warnings.append("Restricted in certain food categories.")
            if match.banned_in_infant_foods:
                warnings.append("Not recommended for infants.")

            provenance = {
                "authority": match.source_authority,
                "document": match.source_document,
                "version": match.source_version_or_date,
                "registry_version": self.metadata.get("dataset_version"),
                "last_verified_at": match.last_verified_at or self.metadata.get("last_verified_at"),
            }

            return ResolvedAdditive(
                input_code=raw_code,
                input_name=additive_name,
                normalized_ins_code=self.normalize_ins_code(match.ins_code),
                canonical_name=match.canonical_name,
                matched=True,
                match_method=match_method,
                regulatory_status=match.regulatory_status,
                application_risk_tier=match.application_risk_tier,
                functional_classes=match.functional_classes,
                adi_mg_per_kg_bw=match.adi_mg_per_kg_bw,
                mandatory_warning=match.mandatory_warning,
                warnings=warnings,
                requires_review=match.verification_status in ("requires_review", "unverified"),
                provenance=provenance,
            )

        # --- Unresolved additive: unknown ≠ hazardous ---
        return ResolvedAdditive(
            input_code=raw_code,
            input_name=additive_name,
            normalized_ins_code=norm_ins,
            canonical_name=additive_name or raw_code or "Unknown",
            matched=False,
            match_method="unmatched",
            regulatory_status="unknown",
            application_risk_tier="unclassified",
            requires_review=True,
            warnings=["Additive could not be conclusively resolved against the current regulatory registry."],
            provenance={"note": "Not found in local verified FSSAI registry."},
        )

    # -----------------------------------------------------------------------
    # Scoring
    # -----------------------------------------------------------------------

    def calculate_additive_penalty(self, resolved: ResolvedAdditive) -> int:
        """
        Deterministic penalty for a single resolved additive.
        These are Z-SeHealth application heuristics, NOT official FSSAI scores.
        """
        return PENALTY_TABLE.get(resolved.application_risk_tier, 0)

    def calculate_food_safety_score(
        self,
        additives: List[ResolvedAdditive],
        current_warnings: List[str],
    ) -> int:
        """
        Calculate deterministic food safety score.

        Deduplicates by canonical INS code (or name for unresolved additives)
        so the same additive listed multiple times (e.g. INS 621, E621, MSG)
        is penalized only once.

        Formula:
            score = 100 + sum(deterministic_penalty(unique_additive))
            clamped to [1, 100]

        No LLM-generated score participates. No model prediction participates.
        """
        score = 100
        unique_additives: Dict[str, ResolvedAdditive] = {}

        for add in additives:
            # Deduplication key: canonical INS code (preferred), else name
            key = add.normalized_ins_code or add.canonical_name or add.input_name or add.input_code
            if key and key not in unique_additives:
                unique_additives[key] = add

        for add in unique_additives.values():
            score += self.calculate_additive_penalty(add)  # penalties are negative

        return max(1, min(100, score))

    def resolve_and_deduplicate(
        self,
        detected_additives: List[dict],
        parsed_ingredients: List[str],
    ) -> Tuple[List[ResolvedAdditive], List[str]]:
        """
        Resolve all candidate additives, deduplicate by INS identity, and collect warnings.

        Args:
            detected_additives: List of dicts with 'code' and/or 'name' from OCR/OFF.
            parsed_ingredients: List of ingredient strings from OCR/OFF.

        Returns:
            (resolved_additives, warnings)
        """
        resolved: List[ResolvedAdditive] = []
        seen_ins: Set[Optional[str]] = set()

        # 1. Resolve explicitly detected INS additives
        for add_input in detected_additives:
            if isinstance(add_input, dict):
                code = add_input.get("code")
                name = add_input.get("name")
            else:
                code = None
                name = str(add_input)

            r = self.resolve_additive_safety(raw_code=code, additive_name=name)
            dedup_key = r.normalized_ins_code or r.canonical_name
            if dedup_key and dedup_key not in seen_ins:
                seen_ins.add(dedup_key)
                resolved.append(r)

        # 2. Scan parsed ingredients for known additives
        for ing in parsed_ingredients:
            r = self.resolve_additive_safety(raw_code=None, additive_name=ing)
            if r.matched:
                dedup_key = r.normalized_ins_code or r.canonical_name
                if dedup_key and dedup_key not in seen_ins:
                    seen_ins.add(dedup_key)
                    resolved.append(r)

        # 3. Collect warnings from resolved additives
        warnings: List[str] = []
        for r in resolved:
            warnings.extend(r.warnings)

        return resolved, list(set(warnings))


# ---------------------------------------------------------------------------
# Module-level singleton — FAIL CLOSED if registry is corrupt
# ---------------------------------------------------------------------------
fssai_resolver = FSSAIRegulatoryService()
