"""
agents/clause_extractor.py
---------------------------
Extracts and analyzes individual clauses from a contract.

For each identified clause it produces:
  - title        : short clause name
  - category     : Termination | IP | Compensation | Confidentiality | etc.
  - original     : the raw clause text from the document
  - plain        : plain-English explanation
  - risk         : "low" | "medium" | "high"
  - reason       : why this risk level was assigned
  - consequences : what happens to the user if they sign as-is
  - negotiation  : how to negotiate or improve this clause
  - confidence   : how confident the LLM is (0.0-1.0)

Uses Self-Healing RAG retrieval to find each clause type,
then the LLM to analyze it.
"""
import json
import re
from typing import List, Dict, Any

from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.vectorstores import Chroma

import config
from pipeline.rag import run_contract_query

CLAUSE_CATEGORIES = [
    "Non-Compete",
    "Intellectual Property / IP Assignment",
    "Termination",
    "Confidentiality / NDA",
    "Payment Terms",
    "Liability / Indemnification",
    "Dispute Resolution / Arbitration",
    "Signing Bonus / Clawback",
    "Auto-Renewal",
    "Governing Law",
]

CLAUSE_EXTRACTION_PROMPT = ChatPromptTemplate.from_template("""
You are a legal analyst extracting and analyzing a specific clause from a contract.

Contract text:
{contract_text}

Task: Find and analyze the "{clause_type}" clause in this contract.

Respond with ONLY a valid JSON object in this exact format (no markdown, no explanation):
{{
  "found": true,
  "title": "<short clause name>",
  "category": "<category>",
  "original": "<exact verbatim clause text from the document>",
  "plain": "<plain English explanation in 1-2 sentences>",
  "risk": "<low|medium|high>",
  "reason": "<why this risk level — 1 sentence>",
  "consequences": "<what happens if signed as-is — 1 sentence>",
  "negotiation": "<how to improve this clause — 1 sentence>",
  "confidence": <0.0 to 1.0>
}}

If the clause is NOT present in the contract, respond with:
{{"found": false}}

Respond with ONLY the JSON object, nothing else.
""")


def extract_clauses(
    raw_text: str,
    vectorstore: Chroma,
    contract_id: str,
) -> List[Dict[str, Any]]:
    """
    Extract and analyze all relevant clauses from a contract.

    Strategy:
    1. Use Self-Healing RAG to retrieve context for each clause type
    2. LLM analyzes the retrieved context and extracts the clause
    3. Return only clauses that were actually found

    Args:
        raw_text    : full contract text (used as fallback context)
        vectorstore : contract's Chroma vector store
        contract_id : used for RAG scoping

    Returns:
        List of clause dicts matching the frontend ClauseDTO shape
    """
    llm   = ChatGroq(model=config.LLM_MODEL, temperature=0, groq_api_key=config.GROQ_API_KEY)
    chain = CLAUSE_EXTRACTION_PROMPT | llm

    # Use first 8000 chars of raw text as primary context
    contract_excerpt = raw_text[:8000]

    clauses = []

    for clause_type in CLAUSE_CATEGORIES:
        try:
            response = chain.invoke({
                "contract_text": contract_excerpt,
                "clause_type":   clause_type,
            })

            content = response.content.strip()

            # Strip markdown code fences if LLM adds them
            content = re.sub(r"```(?:json)?", "", content).strip()

            parsed = json.loads(content)

            if not parsed.get("found"):
                continue

            # Build clause dict matching frontend ClauseDTO exactly
            clause = {
                "title":        parsed.get("title",        clause_type),
                "category":     parsed.get("category",     clause_type),
                "original":     parsed.get("original",     ""),
                "plain":        parsed.get("plain",        ""),
                "risk":         parsed.get("risk",         "medium"),
                "reason":       parsed.get("reason",       ""),
                "consequences": parsed.get("consequences", ""),
                "negotiation":  parsed.get("negotiation",  ""),
                "confidence":   float(parsed.get("confidence", 0.8)),
            }

            # Validate risk level
            if clause["risk"] not in ("low", "medium", "high"):
                clause["risk"] = "medium"

            clauses.append(clause)

        except (json.JSONDecodeError, Exception) as e:
            # Skip clauses that fail to parse — don't crash the whole pipeline
            print(f"[clause_extractor] Skipped '{clause_type}': {e}")
            continue

    return clauses


def extract_obligations(raw_text: str) -> List[Dict[str, Any]]:
    """
    Extract party obligations from the contract.
    Returns list of {party, obligation, due} dicts.
    """
    llm = ChatGroq(model=config.LLM_MODEL, temperature=0, groq_api_key=config.GROQ_API_KEY)

    prompt = ChatPromptTemplate.from_template("""
You are a legal analyst extracting obligations from a contract.

Contract text:
{text}

List every obligation or duty that each party must fulfill.
Include deadlines where mentioned.

Respond with ONLY a valid JSON array (no markdown):
[
  {{"party": "<party name>", "obligation": "<what they must do>", "due": "<deadline or null>"}},
  ...
]

Respond with ONLY the JSON array.
""")

    chain    = prompt | llm
    response = chain.invoke({"text": raw_text[:6000]})
    content  = response.content.strip()
    content  = re.sub(r"```(?:json)?", "", content).strip()

    try:
        obligations = json.loads(content)
        # Clean up nulls
        for o in obligations:
            if o.get("due") in (None, "null", "None", "N/A", ""):
                o.pop("due", None)
        return obligations
    except Exception:
        return []


def extract_dates(raw_text: str) -> List[Dict[str, Any]]:
    """
    Extract important dates and deadlines from the contract.
    Returns list of {label, date, kind} dicts.
    """
    llm = ChatGroq(model=config.LLM_MODEL, temperature=0, groq_api_key=config.GROQ_API_KEY)

    prompt = ChatPromptTemplate.from_template("""
You are a legal analyst extracting important dates from a contract.

Contract text:
{text}

Find every important date, deadline, or time-sensitive event.
Classify each as: renewal | expiry | payment | review

Respond with ONLY a valid JSON array (no markdown):
[
  {{"label": "<description>", "date": "<YYYY-MM-DD or best estimate>", "kind": "<renewal|expiry|payment|review>"}},
  ...
]

Respond with ONLY the JSON array.
""")

    chain    = prompt | llm
    response = chain.invoke({"text": raw_text[:6000]})
    content  = response.content.strip()
    content  = re.sub(r"```(?:json)?", "", content).strip()

    try:
        return json.loads(content)
    except Exception:
        return []


def extract_missing_clauses(raw_text: str) -> List[str]:
    """Identify standard clauses that are missing from the contract."""
    llm = ChatGroq(model=config.LLM_MODEL, temperature=0, groq_api_key=config.GROQ_API_KEY)

    prompt = ChatPromptTemplate.from_template("""
You are a legal analyst reviewing a contract for completeness.

Contract text:
{text}

List any STANDARD clauses that are typically expected in this type of contract
but appear to be MISSING or insufficiently defined.

Respond with ONLY a JSON array of short strings (no markdown):
["<missing clause 1>", "<missing clause 2>", ...]

If nothing is missing, return: []
""")

    chain    = prompt | llm
    response = chain.invoke({"text": raw_text[:5000]})
    content  = response.content.strip()
    content  = re.sub(r"```(?:json)?", "", content).strip()

    try:
        return json.loads(content)
    except Exception:
        return []


def extract_negotiation_tips(raw_text: str, clauses: List[Dict]) -> List[str]:
    """Generate top-level negotiation tips based on the high-risk clauses found."""
    high_risk = [c for c in clauses if c.get("risk") == "high"]
    medium_risk = [c for c in clauses if c.get("risk") == "medium"]
    priority_clauses = (high_risk + medium_risk)[:5]

    if not priority_clauses:
        return []

    tips = []
    for clause in priority_clauses:
        tip = clause.get("negotiation", "").strip()
        if tip:
            tips.append(tip)

    return tips
