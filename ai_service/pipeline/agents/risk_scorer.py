"""
agents/risk_scorer.py
---------------------
Computes a contract risk score (0-100) and per-category breakdown.

Risk score logic:
  - Starts at 0
  - Each clause contributes weighted points based on risk level:
      high   → 20 pts
      medium → 10 pts
      low    → 2  pts
  - Clause category weights amplify the score for legally critical areas
  - Score is normalised to 0-100

Category weights (higher = more dangerous if risky):
  Non-Compete              → 1.5x
  IP / Intellectual Prop   → 1.5x
  Liability / Indemnif.    → 1.3x
  Termination              → 1.2x
  Confidentiality          → 1.1x
  Everything else          → 1.0x
"""
from typing import List, Dict, Any


CATEGORY_WEIGHTS: Dict[str, float] = {
    "non-compete":           1.5,
    "intellectual property": 1.5,
    "ip assignment":         1.5,
    "ip / ownership":        1.5,
    "liability":             1.3,
    "indemnification":       1.3,
    "termination":           1.2,
    "confidentiality":       1.1,
    "nda":                   1.1,
    "payment":               1.0,
    "dispute resolution":    1.0,
    "arbitration":           1.0,
    "governing law":         0.8,
}

RISK_POINTS: Dict[str, int] = {
    "high":   20,
    "medium": 10,
    "low":    2,
}

RISK_CATEGORIES_FOR_CHART = [
    "Termination",
    "IP / Ownership",
    "Liability",
    "Payment",
    "Confidentiality",
    "Non-compete",
]


def get_category_weight(category: str) -> float:
    """Look up category weight (case-insensitive substring match)."""
    cat_lower = category.lower()
    for key, weight in CATEGORY_WEIGHTS.items():
        if key in cat_lower:
            return weight
    return 1.0


def compute_risk_score(clauses: List[Dict[str, Any]]) -> int:
    """
    Compute overall contract risk score from 0 to 100.

    Args:
        clauses: List of clause dicts (each must have 'risk' and 'category')

    Returns:
        Integer risk score 0-100
    """
    if not clauses:
        return 0

    raw_score = 0.0

    for clause in clauses:
        risk     = clause.get("risk", "low")
        category = clause.get("category", "")
        points   = RISK_POINTS.get(risk, 2)
        weight   = get_category_weight(category)
        raw_score += points * weight

    # Max theoretical score (all high-risk, all at 1.5x weight)
    max_per_clause = RISK_POINTS["high"] * 1.5
    max_score      = max_per_clause * max(len(clauses), 5)

    normalised = min(100, int((raw_score / max_score) * 100))
    return normalised


def compute_risk_categories(clauses: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Compute per-category risk contribution for the frontend radar/bar chart.

    Returns list of {name, value} dicts matching the frontend riskCategories shape.
    """
    category_scores: Dict[str, float] = {cat: 0.0 for cat in RISK_CATEGORIES_FOR_CHART}

    for clause in clauses:
        risk     = clause.get("risk", "low")
        category = clause.get("category", "").lower()
        points   = RISK_POINTS.get(risk, 2)

        # Map to chart category
        if "non-compete" in category or "noncompete" in category:
            category_scores["Non-compete"]    += points
        elif "ip" in category or "intellectual" in category or "ownership" in category:
            category_scores["IP / Ownership"] += points
        elif "terminat" in category:
            category_scores["Termination"]    += points
        elif "liabilit" in category or "indemnif" in category:
            category_scores["Liability"]      += points
        elif "payment" in category or "compensation" in category or "bonus" in category:
            category_scores["Payment"]        += points
        elif "confidential" in category or "nda" in category:
            category_scores["Confidentiality"] += points

    # Normalise each category to 0-30 range for chart display
    max_cat = max(category_scores.values()) if category_scores.values() else 1
    if max_cat == 0:
        max_cat = 1

    return [
        {"name": name, "value": int((score / max_cat) * 30)}
        for name, score in category_scores.items()
    ]


def assess_overall_confidence(
    clauses:    List[Dict[str, Any]],
    page_count: int,
    raw_text:   str,
) -> float:
    """
    Compute an overall confidence score for the analysis (0.0-1.0).

    Factors:
      - Average clause confidence
      - Number of clauses found relative to document length
      - Whether sufficient text was extracted (very short = low confidence)
    """
    if not clauses:
        return 0.5

    avg_clause_confidence = sum(
        c.get("confidence", 0.8) for c in clauses
    ) / len(clauses)

    # Penalise if very few clauses found in a long document
    words_per_page  = len(raw_text.split()) / max(page_count, 1)
    coverage_factor = min(1.0, len(clauses) / max(5, page_count // 3))

    confidence = avg_clause_confidence * 0.7 + coverage_factor * 0.3
    return round(min(0.99, max(0.10, confidence)), 2)
