"""
pipeline/analyzer.py
--------------------
Orchestrates all agents to produce a complete contract analysis.

This is called by main.py after a document is ingested.
It runs all agents in the optimal order and assembles the final
analysis payload that gets sent back to the Node.js backend.

Order:
  1. summarizer       — fast, needs only raw text
  2. clause_extractor — heaviest, uses LLM per clause type
  3. risk_scorer      — pure math, depends on clause results
  4. date extractor   — uses LLM on raw text
  5. obligation extractor — uses LLM on raw text
  6. missing clause detector — uses LLM
  7. negotiation tips — derived from clauses
"""
from typing import Any, Dict
import time

from langchain_community.vectorstores import Chroma

from pipeline.agents.summarizer       import generate_summary
from pipeline.agents.clause_extractor import (
    extract_clauses,
    extract_obligations,
    extract_dates,
    extract_missing_clauses,
    extract_negotiation_tips,
)
from pipeline.agents.risk_scorer import (
    compute_risk_score,
    assess_overall_confidence,
)


def detect_contract_type(raw_text: str) -> str:
    """Heuristic contract type detection from text keywords."""
    text_lower = raw_text[:3000].lower()

    if any(k in text_lower for k in ["employment", "employee", "employer", "salary", "job offer"]):
        return "Employment"
    if any(k in text_lower for k in ["lease", "landlord", "tenant", "rent", "premises"]):
        return "Rental"
    if any(k in text_lower for k in ["non-disclosure", "nda", "confidential information", "mutual nda"]):
        return "NDA"
    if any(k in text_lower for k in ["freelance", "contractor", "services agreement", "master services"]):
        return "Freelance"
    if any(k in text_lower for k in ["loan", "borrower", "lender", "interest rate", "repayment"]):
        return "Loan"
    if any(k in text_lower for k in ["service agreement", "service provider", "client", "deliverable"]):
        return "Service Agreement"

    return "Contract"


def extract_party_name(raw_text: str) -> str:
    """
    Extract the counter-party name from the contract text.
    Uses simple heuristics: looks for 'between X and Y' pattern.
    """
    import re
    patterns = [
        r"between\s+([A-Z][A-Za-z\s,\.]+?)\s+(?:and|AND)\s+",
        r"(?:Company|Employer|Landlord|Licensor)[\s:\"']+([A-Z][A-Za-z\s,\.]{2,40})",
        r'"([A-Z][A-Za-z\s]{2,30})"\s+\((?:the\s+)?(?:Company|Employer|Landlord)\)',
    ]
    for pattern in patterns:
        match = re.search(pattern, raw_text[:3000])
        if match:
            name = match.group(1).strip().rstrip(",.")
            if 2 < len(name) < 60:
                return name

    return "Unknown Party"


def run_full_analysis(
    raw_text:    str,
    vectorstore: Chroma,
    contract_id: str,
    page_count:  int,
) -> Dict[str, Any]:
    """
    Run the complete analysis pipeline for a contract.

    Args:
        raw_text    : full extracted text
        vectorstore : built Chroma vector store for this contract
        contract_id : contract UUID
        page_count  : extracted page count

    Returns:
        Full analysis payload dict matching the backend PATCH /analysis body shape:
        {
            type, party, pages, riskScore, confidence,
            summary, missing, negotiation, rawText,
            clauses, obligations, dates
        }
    """
    print(f"[analyzer] Starting full analysis for contract {contract_id}")
    analysis_started_at = time.perf_counter()

    # ── 1. Contract metadata ───────────────────────────────────────────────
    contract_type = detect_contract_type(raw_text)
    party_name    = extract_party_name(raw_text)
    print(f"[analyzer] Detected type={contract_type}, party={party_name}")

    # ── 2. Summary ────────────────────────────────────────────────────────
    print("[analyzer] Generating summary...")
    summary_started_at = time.perf_counter()
    summary = generate_summary(raw_text)
    print(f"[SUMMARY] contractId={contract_id} elapsed={time.perf_counter() - summary_started_at:.2f}s")

    # ── 3. Clause extraction (heaviest step) ──────────────────────────────
    print("[analyzer] Extracting clauses...")
    clauses_started_at = time.perf_counter()
    clauses = extract_clauses(raw_text, vectorstore, contract_id)
    print(f"[analyzer] Found {len(clauses)} clauses")
    print(f"[CLAUSES] contractId={contract_id} elapsed={time.perf_counter() - clauses_started_at:.2f}s")

    # ── 4. Risk scoring ───────────────────────────────────────────────────
    risk_score = compute_risk_score(clauses)
    confidence = assess_overall_confidence(clauses, page_count, raw_text)
    print(f"[analyzer] Risk score={risk_score}, confidence={confidence}")

    # ── 5. Dates ──────────────────────────────────────────────────────────
    print("[analyzer] Extracting dates...")
    dates = extract_dates(raw_text)

    # ── 6. Obligations ────────────────────────────────────────────────────
    print("[analyzer] Extracting obligations...")
    obligations = extract_obligations(raw_text)

    # ── 7. Missing clauses ────────────────────────────────────────────────
    print("[analyzer] Checking for missing clauses...")
    missing = extract_missing_clauses(raw_text)

    # ── 8. Negotiation tips ───────────────────────────────────────────────
    negotiation = extract_negotiation_tips(raw_text, clauses)

    print(f"[analyzer] Analysis complete for {contract_id}")
    print(f"[ANALYSIS DONE] contractId={contract_id} elapsed={time.perf_counter() - analysis_started_at:.2f}s")

    return {
        "type":        contract_type,
        "party":       party_name,
        "pages":       page_count,
        "riskScore":   risk_score,
        "confidence":  confidence,
        "summary":     summary,
        "missing":     missing,
        "negotiation": negotiation,
        "rawText":     raw_text,
        "clauses":     clauses,
        "obligations": obligations,
        "dates":       dates,
    }
