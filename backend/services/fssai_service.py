import json
import os
import re
from typing import Dict, List, Optional, Tuple
from schemas.fssai import FSSAIAdditive, ResolvedAdditive

class FSSAIRegulatoryService:
    def __init__(self):
        self.registry: Dict[str, FSSAIAdditive] = {}
        self.by_canonical_name: Dict[str, FSSAIAdditive] = {}
        self.by_alias: Dict[str, FSSAIAdditive] = {}
        self.metadata: Dict = {}
        self._load_registry()

    def _load_registry(self):
        filepath = os.path.join(os.path.dirname(__file__), "..", "data", "fssai_master_additives.json")
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            self.metadata = data.get("registry_metadata", {})
            additives = data.get("additives", [])
            
            for item in additives:
                try:
                    additive = FSSAIAdditive(**item)
                except Exception as e:
                    print(f"Failed to parse additive: {e}")
                    continue
                
                norm_ins = self.normalize_ins_code(additive.ins_code)
                if norm_ins:
                    self.registry[norm_ins] = additive
                
                norm_name = self._normalize_name(additive.canonical_name)
                self.by_canonical_name[norm_name] = additive
                
                for alias in additive.aliases:
                    norm_alias = self._normalize_name(alias)
                    self.by_alias[norm_alias] = additive
                    
        except FileNotFoundError:
            print(f"Warning: FSSAI master dataset not found at {filepath}")
            raise
        except Exception as e:
            print(f"Error loading FSSAI registry: {e}")
            raise

    @staticmethod
    def normalize_ins_code(code: str) -> Optional[str]:
        if not code:
            return None
        
        # Remove harmless punctuation and spaces, normalize case
        cleaned = code.strip().upper()
        # Find numeric part and potential suffix like (ii)
        match = re.search(r'(?:E|INS|E-)?\s*(\d+[A-Z]*(?:\([IVXivx]+\))?)', cleaned)
        if match:
            # Reconstruct as INS XXX
            return f"INS {match.group(1)}"
        return None

    @staticmethod
    def _normalize_name(name: str) -> str:
        if not name:
            return ""
        # Lowercase, remove parens and brackets, trim
        cleaned = re.sub(r'[^\w\s]', '', name.lower())
        return re.sub(r'\s+', ' ', cleaned).strip()

    def resolve_additive_safety(self, raw_code: Optional[str], additive_name: Optional[str]) -> ResolvedAdditive:
        norm_ins = self.normalize_ins_code(raw_code or "")
        norm_name = self._normalize_name(additive_name or "")
        
        match = None
        match_method = "unmatched"
        
        # 1. INS Code Match
        if norm_ins and norm_ins in self.registry:
            match = self.registry[norm_ins]
            match_method = "ins_code"
        
        # 2. Canonical Name Match
        elif norm_name and norm_name in self.by_canonical_name:
            match = self.by_canonical_name[norm_name]
            match_method = "canonical_name"
            
        # 3. Alias Match
        elif norm_name and norm_name in self.by_alias:
            match = self.by_alias[norm_name]
            match_method = "alias"
            
        # 4. Fallback: extract INS from name e.g. "Tartrazine (102)"
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
                "last_verified_at": match.last_verified_at or self.metadata.get("last_verified_at")
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
                requires_review=match.regulatory_status in ["requires_review", "unverified"],
                provenance=provenance
            )
            
        # Unmatched / Unknown Additive Policy
        return ResolvedAdditive(
            input_code=raw_code,
            input_name=additive_name,
            normalized_ins_code=norm_ins,
            matched=False,
            match_method="unmatched",
            regulatory_status="requires_review",
            application_risk_tier="unclassified",
            requires_review=True,
            warnings=["Unverified additive: Requires regulatory review."],
            provenance={"note": "Not found in local verified FSSAI registry."}
        )

    def calculate_food_safety_score(self, additives: List[ResolvedAdditive], current_warnings: List[str]) -> int:
        score = 100
        unique_additives = {}
        
        for add in additives:
            # Deduplicate by normalized INS code, fallback to name
            key = add.normalized_ins_code or add.input_name or add.canonical_name
            if key and key not in unique_additives:
                unique_additives[key] = add
                
        for add in unique_additives.values():
            if add.application_risk_tier == "moderate":
                score -= 5
            elif add.application_risk_tier in ["high", "restricted"]:
                score -= 18
            elif add.application_risk_tier == "hazardous":
                score -= 35
                
            if add.mandatory_warning:
                score -= 10
                
        # Deduct for external warnings if any exist, apply a generic deduction
        for warn in current_warnings:
            if warn:
                score -= 5 # arbitrary deduction for other warnings, or we could just rely on additive warnings

        return max(1, min(100, score))

fssai_resolver = FSSAIRegulatoryService()
