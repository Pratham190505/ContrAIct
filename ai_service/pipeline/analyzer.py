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
from pydantic import BaseModel, Field, ValidationError

try:
    from json_repair import repair_json
except ImportError:
    repair_json = None

import config
from pipeline.agents.clause_extractor import extract_dates, extract_obligations
from pipeline.llm_client import get_upload_call_count, invoke_llm, is_tool_use_failed, reset_upload_call_count


MAX_CONTEXT_CHARS = 6000
MAX_TEXT_EXCERPT_CHARS = 3000
RETRY_CONTEXT_CHARS = 2500
RETRY_TEXT_EXCERPT_CHARS = 1500
MAX_ANALYSIS_CLAUSES = 6
MAX_ORIGINAL_EXCERPT_CHARS = 150
MAX_COMPLETION_TOKENS = 3500


class ClausePayload(BaseModel):
    title: str = Field(default="Clause")
    # Keep this as a string at the provider schema level so a model
    # using a synonym such as "Indemnification" cannot cause a Groq
    # schema-validation 400. It is normalized to the allowed UI
    # categories in _normalize_analysis_payload().
    category: str = "Other"
    original: str = ""
    plain: str = ""
    risk: Literal["low", "medium", "high"] = "medium"
    reason: str = ""
    consequences: str = ""
    negotiation: str = ""
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

Return ONLY compact valid JSON. No markdown.

Return ALL 8 keys:
summary, riskScore, confidence, clauses, obligations, dates, missing, negotiation.

Always include every key.
For empty arrays use [].

Maximum 6 clauses.
Keep all text concise.
Complete the entire JSON object before stopping.

IMPORTANT:
- Return a complete JSON object.
- Always return ALL 8 top-level keys:
  summary, riskScore, confidence, clauses, obligations, dates, missing, negotiation.
- Never omit any key.
- If an array has no data, return [].
- Keep clauses to a maximum of 6.
- Keep each clause concise.
- Ensure the JSON is valid and complete before finishing.

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
      "reason": "<why this risk level was assigned, max 25 words>",
      "consequences": "<what happens if signed as-is, max 25 words>",
      "negotiation": "<how to improve this clause, max 25 words>",
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

CATEGORY RULES (VERY IMPORTANT):
- category MUST be exactly one of: Termination, IP, Compensation, Confidentiality, Restrictions, Liability, Dispute Resolution, Other.
- Never use a category such as Indemnification, NDA, Non-Compete, Governing Law, or Payment Terms.
- For indemnification clauses, use category "Liability".
- For limitation-of-liability clauses, use category "Liability".
- For NDA/confidentiality clauses, use category "Confidentiality".
- For non-compete/non-solicitation clauses, use category "Restrictions".
- For governing-law clauses, use category "Other" unless they are primarily about dispute resolution, in which case use "Dispute Resolution".
- The title may use the specific clause name (for example "Indemnification"); only category is restricted.

Rules:
- Include only clauses present in the contract.
- Prioritize high-impact legal and commercial terms.
- Return at most 6 clauses.
- Return high and medium risk clauses first; include low risk only if fewer than 10 high/medium clauses exist.
- Do not include full clause text. Use only a short excerpt in "original".
- Summary must be max 3 sentences.
- Reason, consequences, and negotiation must each be max 40 words.
- Use "medium" risk if risk is unclear.
- ALWAYS include obligations, dates, missing, and negotiation, even when empty.
- Use [] for any array with no items.
- Complete the entire JSON object before stopping.
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

IMPORTANT:
Return ALL 8 keys.
Never omit any key.
If an array has no items, return [].
The response is invalid if obligations, dates, missing, or negotiation are omitted.
Complete the JSON object before stopping.
Clauses: max 6, high/medium first, low only if needed. Each clause has title, category, original, plain, risk, reason, consequences, negotiation, confidence.
Category MUST be exactly one of: Termination, IP, Compensation, Confidentiality, Restrictions, Liability, Dispute Resolution, Other. For indemnification or limitation-of-liability use Liability; for NDA use Confidentiality; for non-compete/non-solicitation use Restrictions; for other unsupported categories use Other. The title may remain specific.
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


ALLOWED_CATEGORIES = {
    "Termination",
    "IP",
    "Compensation",
    "Confidentiality",
    "Restrictions",
    "Liability",
    "Dispute Resolution",
    "Other",
}

CATEGORY_ALIASES = {
    "indemnification": "Liability",
    "indemnity": "Liability",
    "limitation of liability": "Liability",
    "liability / indemnification": "Liability",
    "liability and indemnification": "Liability",
    "nda": "Confidentiality",
    "non-disclosure": "Confidentiality",
    "non disclosure": "Confidentiality",
    "confidentiality / nda": "Confidentiality",
    "non-compete": "Restrictions",
    "non compete": "Restrictions",
    "non-solicitation": "Restrictions",
    "non solicitation": "Restrictions",
    "restrictions": "Restrictions",
    "payment": "Compensation",
    "payment terms": "Compensation",
    "salary": "Compensation",
    "arbitration": "Dispute Resolution",
    "dispute resolution / arbitration": "Dispute Resolution",
    "governing law": "Other",
}

def _normalize_category(value: Any) -> str:
    category = " ".join(str(value or "").split()).strip()
    if category in ALLOWED_CATEGORIES:
        return category
    return CATEGORY_ALIASES.get(category.lower(), "Other")


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
            "category": _normalize_category(clause.get("category")),
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


def _normalize_legacy_obligations(items: Any) -> list[Dict[str, Any]]:
    obligations: list[Dict[str, Any]] = []
    if not isinstance(items, list):
        return obligations

    for item in items:
        if not isinstance(item, dict):
            continue
        obligation_text = str(item.get("obligation") or "").strip()
        if not obligation_text:
            continue

        normalized: Dict[str, Any] = {
            "party": str(item.get("party") or "Party"),
            "obligation": obligation_text,
        }
        due = item.get("due")
        if due not in (None, "null", "None", "N/A", ""):
            normalized["due"] = str(due)
        obligations.append(normalized)

    return obligations


def _normalize_legacy_dates(items: Any) -> list[Dict[str, Any]]:
    dates: list[Dict[str, Any]] = []
    if not isinstance(items, list):
        return dates

    for item in items:
        if not isinstance(item, dict):
            continue
        value = str(item.get("date") or "").strip()
        if not value:
            continue

        kind = str(item.get("kind") or "review")
        if kind not in ("renewal", "expiry", "payment", "review"):
            kind = "review"

        dates.append({
            "label": str(item.get("label") or "Important date"),
            "date": value,
            "kind": kind,
        })

    return dates


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


def _invoke_structured_analysis(messages: Any) -> Any:
    return invoke_llm(
        messages,
        feature="contract_analysis",
        temperature=0,
        max_tokens=MAX_COMPLETION_TOKENS,
        structured_schema=AnalysisPayload,
    )


def _invoke_json_fallback(messages: Any) -> Any:
    print("[LLM] Falling back to strict JSON mode")
    return invoke_llm(
        messages,
        feature="contract_analysis_json_fallback",
        temperature=0,
        max_tokens=MAX_COMPLETION_TOKENS,
    )


def _parse_and_validate_analysis_response(
    response: Any,
    *,
    used_json_fallback: bool,
) -> Dict[str, Any]:
    if _is_truncated(response):
        raise ValueError(f"LLM response truncated: finish_reason={_finish_reason(response)}")

    parsed = _parse_json_object(response)
    if used_json_fallback:
        validated = AnalysisPayload.model_validate(parsed)
        parsed = validated.model_dump()
        print("[LLM] Fallback succeeded")
    return parsed


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
    use_json_fallback = False

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

        response: Any | None = None
        if not use_json_fallback:
            try:
                response = _invoke_structured_analysis(messages)
            except Exception as error:
                if is_tool_use_failed(error):
                    print("[LLM] Structured tool call failed")
                    use_json_fallback = True
                else:
                    raise

        if use_json_fallback:
            response = _invoke_json_fallback(messages)

        try:
            return _parse_and_validate_analysis_response(
                response,
                used_json_fallback=use_json_fallback,
            ), retry_count
        except (json.JSONDecodeError, TypeError, ValueError, ValidationError) as error:
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

    if not structured["obligations"]:
        legacy_obligations = _normalize_legacy_obligations(extract_obligations(raw_text))
        if legacy_obligations:
            print(f"[analyzer] Legacy obligation fallback recovered {len(legacy_obligations)} items for contract {contract_id}")
            structured["obligations"] = legacy_obligations

    if not structured["dates"]:
        legacy_dates = _normalize_legacy_dates(extract_dates(raw_text))
        if legacy_dates:
            print(f"[analyzer] Legacy date fallback recovered {len(legacy_dates)} items for contract {contract_id}")
            structured["dates"] = legacy_dates

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
