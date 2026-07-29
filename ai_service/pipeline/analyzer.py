"""
pipeline/analyzer.py
--------------------
Single-call contract analysis pipeline.
"""
import json
import os
import re
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, Literal

from langchain_community.vectorstores import Chroma
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

try:
    from json_repair import repair_json
except ImportError:
    repair_json = None

import config
from pipeline.llm_client import get_upload_call_count, invoke_llm, reset_upload_call_count


MAX_CONTEXT_CHARS = 6000
MAX_TEXT_EXCERPT_CHARS = 3000
RETRY_CONTEXT_CHARS = 2500
RETRY_TEXT_EXCERPT_CHARS = 1500
MAX_ANALYSIS_CLAUSES = 10
MAX_ORIGINAL_EXCERPT_CHARS = 150
MAX_COMPLETION_TOKENS = 1200


class ClausePayload(BaseModel):
    title: str = Field(default="Clause")
    category: Literal[
        "Termination",
        "IP",
        "Compensation",
        "Confidentiality",
        "Restrictions",
        "Liability",
        "Dispute Resolution",
        "Other",
    ] = "Other"
    original: str = Field(default="", max_length=MAX_ORIGINAL_EXCERPT_CHARS)
    plain: str = ""
    risk: Literal["low", "medium", "high"] = "medium"
    reason: str = Field(default="", max_length=280)
    consequences: str = Field(default="", max_length=280)
    negotiation: str = Field(default="", max_length=280)
    confidence: float = Field(default=0.75, ge=0, le=1)


class ObligationPayload(BaseModel):
    party: str = "Party"
    obligation: str = ""
    due: str | None = None


class DatePayload(BaseModel):
    label: str = "Important date"
    date: str = ""
    kind: Literal["renewal", "expiry", "payment", "review"] = "review"


class AnalysisPayload(BaseModel):
    summary: str = ""
    riskScore: int = Field(default=50, ge=0, le=100)
    confidence: float = Field(default=0.75, ge=0, le=1)
    clauses: list[ClausePayload] = Field(default_factory=list, max_length=MAX_ANALYSIS_CLAUSES)
    obligations: list[ObligationPayload] = Field(default_factory=list)
    dates: list[DatePayload] = Field(default_factory=list)
    missing: list[str] = Field(default_factory=list)
    negotiation: list[str] = Field(default_factory=list)


def detect_contract_type(raw_text: str) -> str:
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


ANALYSIS_PROMPT = ChatPromptTemplate.from_template("""
You are ContrAIct, a careful legal analyst. Analyze the contract using the provided retrieved context and text excerpt.

Return ONLY one valid JSON object. Do not use markdown. Keep the whole response under 1200 tokens.

Required schema:
{{
  "summary": "<maximum 3 sentence plain-English summary>",
  "riskScore": <integer 0-100>,
  "confidence": <number 0.0-1.0>,
  "clauses": [
    {{
      "title": "<short clause name>",
      "category": "<Termination|IP|Compensation|Confidentiality|Restrictions|Liability|Dispute Resolution|Other>",
      "original": "<short clause excerpt, max 150 chars>",
      "plain": "<plain-English explanation>",
      "risk": "<low|medium|high>",
      "reason": "<why this risk level was assigned, max 40 words>",
      "consequences": "<what happens if signed as-is, max 40 words>",
      "negotiation": "<how to improve this clause, max 40 words>",
      "confidence": <number 0.0-1.0>
    }}
  ],
  "obligations": [
    {{"party": "<party name>", "obligation": "<what they must do>", "due": "<deadline or null>"}}
  ],
  "dates": [
    {{"label": "<description>", "date": "<YYYY-MM-DD or best estimate>", "kind": "<renewal|expiry|payment|review>"}}
  ],
  "missing": ["<missing or weak standard clause>"],
  "negotiation": ["<top negotiation tip>"]
}}

Rules:
- Include only clauses present in the contract.
- Prioritize high-impact legal and commercial terms.
- Return at most 10 clauses.
- Return high and medium risk clauses first; include low risk only if fewer than 10 high/medium clauses exist.
- Do not include full clause text. Use only a short excerpt in "original".
- Summary must be max 3 sentences.
- Reason, consequences, and negotiation must each be max 40 words.
- Use "medium" risk if risk is unclear.
- Use [] when no items are found.
- Date kind must be one of: renewal, expiry, payment, review.
- Clause risk must be one of: low, medium, high.

Contract type detected heuristically: {contract_type}
Likely counter-party detected heuristically: {party_name}

Retrieved contract context:
{retrieved_context}

Contract excerpt:
{text_excerpt}
""")


RETRY_ANALYSIS_PROMPT = ChatPromptTemplate.from_template("""
Return ONLY compact valid JSON for this contract analysis. No markdown. Under 900 tokens.

Schema keys: summary, riskScore, confidence, clauses, obligations, dates, missing, negotiation.
Clauses: max 10, high/medium first, low only if needed. Each clause has title, category, original, plain, risk, reason, consequences, negotiation, confidence.
Limits: summary max 3 sentences; original max 150 chars; reason/consequences/negotiation max 40 words each.
Use [] for missing arrays. Use medium when unsure.

Contract type: {contract_type}
Counter-party: {party_name}

Context:
{retrieved_context}

Excerpt:
{text_excerpt}
""")


def _analysis_cache_path(document_hash: str | None) -> str | None:
    if not document_hash:
        return None
    return os.path.join(config.CACHE_BASE_DIR, document_hash, "analysis.json")


def _load_cached_analysis(document_hash: str | None) -> Dict[str, Any] | None:
    path = _analysis_cache_path(document_hash)
    if not path or not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as cache_file:
        return json.load(cache_file)


def _save_cached_analysis(document_hash: str | None, analysis: Dict[str, Any]) -> None:
    path = _analysis_cache_path(document_hash)
    if not path:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as cache_file:
        json.dump(analysis, cache_file)


def _as_dict(payload: Any) -> Dict[str, Any]:
    if isinstance(payload, BaseModel):
        return payload.model_dump()
    if isinstance(payload, dict):
        return payload
    raise TypeError(f"Expected JSON object, got {type(payload).__name__}")


def _response_content(response: Any) -> str:
    if isinstance(response, dict):
        if response.get("parsed") is not None:
            return json.dumps(_as_dict(response["parsed"]))
        raw = response.get("raw")
        return str(getattr(raw, "content", raw or ""))
    return str(getattr(response, "content", response or ""))


def _finish_reason(response: Any) -> str | None:
    raw = response.get("raw") if isinstance(response, dict) else response
    metadata = getattr(raw, "response_metadata", {}) or {}
    finish_reason = metadata.get("finish_reason") or metadata.get("finishReason")
    if finish_reason:
        return str(finish_reason).lower()
    choices = metadata.get("choices") or []
    if choices and isinstance(choices[0], dict):
        reason = choices[0].get("finish_reason")
        return str(reason).lower() if reason else None
    return None


def _is_truncated(response: Any) -> bool:
    reason = _finish_reason(response)
    return reason in {"length", "max_tokens", "content_filter"}


def _parse_json_object(response: Any) -> Dict[str, Any]:
    if isinstance(response, dict) and response.get("parsed") is not None:
        return _as_dict(response["parsed"])

    content = _response_content(response)
    cleaned = re.sub(r"```(?:json)?", "", content).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        repaired_source = cleaned
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if match:
            repaired_source = match.group(0)
        if repair_json:
            repaired = repair_json(repaired_source)
            return json.loads(repaired)
        raise


def _clamp(value: Any, minimum: float, maximum: float, fallback: float) -> float:
    try:
        parsed = float(value)
        return max(minimum, min(maximum, parsed))
    except (TypeError, ValueError):
        return fallback


def _truncate_chars(value: Any, limit: int) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)].rstrip() + "..."


def _limit_words(value: Any, limit: int) -> str:
    words = str(value or "").split()
    if len(words) <= limit:
        return " ".join(words)
    return " ".join(words[:limit]).rstrip(".,;:") + "..."


def _limit_sentences(value: Any, limit: int) -> str:
    text = " ".join(str(value or "").split())
    sentences = re.split(r"(?<=[.!?])\s+", text)
    return " ".join(sentence for sentence in sentences[:limit] if sentence).strip()


def _normalize_analysis_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    clauses = []
    for clause in payload.get("clauses") or []:
        if not isinstance(clause, dict):
            continue
        original = _truncate_chars(clause.get("original"), MAX_ORIGINAL_EXCERPT_CHARS)
        if not original:
            continue
        risk = clause.get("risk", "medium")
        if risk not in ("low", "medium", "high"):
            risk = "medium"
        clauses.append({
            "title": str(clause.get("title") or clause.get("category") or "Clause"),
            "category": str(clause.get("category") or "Other"),
            "original": original,
            "plain": str(clause.get("plain") or "No plain-English explanation provided."),
            "risk": risk,
            "reason": _limit_words(clause.get("reason") or "Risk was inferred from the clause text.", 40),
            "consequences": _limit_words(clause.get("consequences") or "Review this clause before signing.", 40),
            "negotiation": _limit_words(clause.get("negotiation") or "Ask for clearer or more balanced wording.", 40),
            "confidence": _clamp(clause.get("confidence"), 0, 1, 0.75),
        })

    prioritized_clauses = [clause for clause in clauses if clause["risk"] in ("high", "medium")]
    if len(prioritized_clauses) < MAX_ANALYSIS_CLAUSES:
        prioritized_clauses.extend(clause for clause in clauses if clause["risk"] == "low")
    clauses = prioritized_clauses[:MAX_ANALYSIS_CLAUSES]

    obligations = []
    for obligation in payload.get("obligations") or []:
        if not isinstance(obligation, dict):
            continue
        due = obligation.get("due")
        normalized = {
            "party": str(obligation.get("party") or "Party"),
            "obligation": str(obligation.get("obligation") or ""),
        }
        if due not in (None, "null", "None", "N/A", ""):
            normalized["due"] = str(due)
        if normalized["obligation"]:
            obligations.append(normalized)

    dates = []
    for date in payload.get("dates") or []:
        if not isinstance(date, dict):
            continue
        kind = date.get("kind", "review")
        if kind not in ("renewal", "expiry", "payment", "review"):
            kind = "review"
        label = str(date.get("label") or "Important date")
        value = str(date.get("date") or "")
        if value:
            dates.append({"label": label, "date": value, "kind": kind})

    negotiation = [str(item) for item in (payload.get("negotiation") or []) if str(item).strip()]
    if not negotiation:
        negotiation = [
            clause["negotiation"]
            for clause in clauses
            if clause["risk"] in ("high", "medium") and clause["negotiation"]
        ][:5]

    return {
        "riskScore": int(_clamp(payload.get("riskScore"), 0, 100, 50)),
        "confidence": _clamp(payload.get("confidence"), 0, 1, 0.75),
        "summary": _limit_sentences(payload.get("summary") or "", 3),
        "clauses": clauses,
        "obligations": obligations,
        "dates": dates,
        "missing": [str(item) for item in (payload.get("missing") or []) if str(item).strip()],
        "negotiation": negotiation,
    }


def _build_analysis_messages(
    prompt: ChatPromptTemplate,
    contract_type: str,
    party_name: str,
    retrieved_context: str,
    raw_text: str,
    context_limit: int,
    text_limit: int,
) -> Any:
    return prompt.invoke({
        "contract_type": contract_type,
        "party_name": party_name,
        "retrieved_context": retrieved_context[:context_limit],
        "text_excerpt": raw_text[:text_limit],
    })


def _run_analysis_llm(
    contract_type: str,
    party_name: str,
    retrieved_context: str,
    raw_text: str,
) -> tuple[Dict[str, Any], int]:
    attempts = [
        (ANALYSIS_PROMPT, MAX_CONTEXT_CHARS, MAX_TEXT_EXCERPT_CHARS),
        (RETRY_ANALYSIS_PROMPT, RETRY_CONTEXT_CHARS, RETRY_TEXT_EXCERPT_CHARS),
    ]
    last_error: Exception | None = None

    for retry_count, (prompt, context_limit, text_limit) in enumerate(attempts):
        messages = _build_analysis_messages(
            prompt,
            contract_type,
            party_name,
            retrieved_context,
            raw_text,
            context_limit,
            text_limit,
        )
        response = invoke_llm(
            messages,
            feature="contract_analysis",
            temperature=0,
            max_tokens=MAX_COMPLETION_TOKENS,
            structured_schema=AnalysisPayload,
        )
        try:
            if _is_truncated(response):
                raise ValueError(f"LLM response truncated: finish_reason={_finish_reason(response)}")
            return _parse_json_object(response), retry_count
        except (json.JSONDecodeError, TypeError, ValueError) as error:
            last_error = error
            if retry_count == 0:
                print(f"[analyzer] Retrying with shorter prompt after parse/truncation issue: {error}")
                continue
            raise

    raise RuntimeError("Analysis parsing failed after retry") from last_error


def run_full_analysis(
    raw_text: str,
    vectorstore: Chroma,
    contract_id: str,
    page_count: int,
    document_hash: str | None = None,
) -> Dict[str, Any]:
    print(f"[analyzer] Starting full analysis for contract {contract_id}")
    analysis_started_at = time.perf_counter()
    reset_upload_call_count(contract_id)

    cached = _load_cached_analysis(document_hash)
    if cached:
        print(f"[ANALYSIS CACHE HIT] contractId={contract_id} documentHash={document_hash}")
        return {**cached, "rawText": raw_text}

    def retrieve_analysis_context() -> str:
        retriever = vectorstore.as_retriever(search_kwargs={"k": config.ANALYSIS_TOP_K})
        docs = retriever.invoke(
            "contract summary risks obligations deadlines missing clauses negotiation payment termination liability confidentiality intellectual property"
        )
        return "\n\n---\n\n".join(doc.page_content for doc in docs)

    print("[analyzer] Retrieving analysis context and metadata...")
    with ThreadPoolExecutor(max_workers=3) as executor:
        type_future = executor.submit(detect_contract_type, raw_text)
        party_future = executor.submit(extract_party_name, raw_text)
        context_future = executor.submit(retrieve_analysis_context)

        contract_type = type_future.result()
        party_name = party_future.result()
        retrieved_context = context_future.result()

    print(f"[analyzer] Detected type={contract_type}, party={party_name}")

    print("[analyzer] Running primary structured analysis LLM call...")
    payload, retry_count = _run_analysis_llm(contract_type, party_name, retrieved_context, raw_text)
    structured = _normalize_analysis_payload(payload)

    result = {
        "type": contract_type,
        "party": party_name,
        "pages": page_count,
        "rawText": raw_text,
        **structured,
    }

    _save_cached_analysis(document_hash, {key: value for key, value in result.items() if key != "rawText"})
    print(f"[analyzer] Analysis complete for {contract_id}")
    elapsed = time.perf_counter() - analysis_started_at
    print(
        f"[ANALYSIS DONE] contractId={contract_id} elapsed={elapsed:.2f}s "
        f"totalApiCalls={get_upload_call_count(contract_id)} retryCount={retry_count}"
    )
    return result
