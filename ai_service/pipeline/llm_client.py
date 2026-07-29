import json
import os
import random
import threading
import time
from datetime import datetime, timezone
from typing import Any

from langchain_groq import ChatGroq

import config


_rate_lock = threading.Lock()
_last_request_at = 0.0
_upload_context = threading.local()
_upload_counts: dict[str, int] = {}


def reset_upload_call_count(contract_id: str | None = None) -> None:
    _upload_context.contract_id = contract_id
    _upload_context.call_count = 0
    if contract_id:
        with _rate_lock:
            _upload_counts[contract_id] = 0


def get_upload_call_count(contract_id: str | None = None) -> int:
    if contract_id:
        with _rate_lock:
            return _upload_counts.get(contract_id, 0)
    return int(getattr(_upload_context, "call_count", 0))


def _increment_upload_call_count() -> int:
    current = get_upload_call_count() + 1
    _upload_context.call_count = current
    contract_id = getattr(_upload_context, "contract_id", None)
    if contract_id:
        with _rate_lock:
            _upload_counts[contract_id] = _upload_counts.get(contract_id, 0) + 1
            return _upload_counts[contract_id]
    return current


def _wait_for_rate_limit() -> None:
    global _last_request_at
    min_interval = 60.0 / max(config.LLM_REQUESTS_PER_MINUTE, 1)
    with _rate_lock:
        elapsed = time.perf_counter() - _last_request_at
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)
        _last_request_at = time.perf_counter()


def _usage_from_response(response: Any) -> tuple[int | None, int | None]:
    metadata = getattr(response, "response_metadata", {}) or {}
    usage = (
        metadata.get("token_usage")
        or metadata.get("usage")
        or getattr(response, "usage_metadata", None)
        or {}
    )
    prompt_tokens = (
        usage.get("prompt_tokens")
        or usage.get("input_tokens")
        or usage.get("prompt_time")
    )
    completion_tokens = (
        usage.get("completion_tokens")
        or usage.get("output_tokens")
        or usage.get("completion_time")
    )
    return prompt_tokens, completion_tokens


def _is_transient_error(error: Exception) -> bool:
    message = str(error).lower()
    transient_markers = (
        "429",
        "too many requests",
        "rate limit",
        "timeout",
        "temporarily",
        "503",
        "502",
        "500",
    )
    return any(marker in message for marker in transient_markers)


def _log_llm_request(
    feature: str,
    latency_ms: int,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    success: bool,
    error: str | None = None,
) -> None:
    os.makedirs(config.LLM_LOG_DIR, exist_ok=True)
    total_calls = _increment_upload_call_count()
    record = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "feature": feature,
        "contractId": getattr(_upload_context, "contract_id", None),
        "promptTokens": prompt_tokens,
        "completionTokens": completion_tokens,
        "latencyMs": latency_ms,
        "totalApiCallsForUpload": total_calls,
        "success": success,
    }
    if error:
        record["error"] = error

    with open(os.path.join(config.LLM_LOG_DIR, "llm_requests.jsonl"), "a", encoding="utf-8") as log_file:
        log_file.write(json.dumps(record) + "\n")

    print(
        "[LLM REQUEST] "
        f"feature={feature} promptTokens={prompt_tokens} completionTokens={completion_tokens} "
        f"latencyMs={latency_ms} totalApiCallsForUpload={total_calls} success={success}"
    )


def invoke_llm(
    messages: Any,
    feature: str,
    temperature: float = 0,
    max_tokens: int | None = None,
    structured_schema: Any | None = None,
) -> Any:
    llm_kwargs = {
        "model": config.LLM_MODEL,
        "temperature": temperature,
        "groq_api_key": config.GROQ_API_KEY,
    }
    if max_tokens:
        llm_kwargs["max_tokens"] = max_tokens

    llm = ChatGroq(**llm_kwargs)
    runnable = llm
    if structured_schema and hasattr(llm, "with_structured_output"):
        try:
            runnable = llm.with_structured_output(
                structured_schema,
                method="json_mode",
                include_raw=True,
            )
        except TypeError:
            runnable = llm.with_structured_output(structured_schema, include_raw=True)

    attempt = 0
    while True:
        _wait_for_rate_limit()
        started_at = time.perf_counter()
        try:
            response = runnable.invoke(messages)
            latency_ms = int((time.perf_counter() - started_at) * 1000)
            raw_response = response.get("raw") if isinstance(response, dict) else response
            prompt_tokens, completion_tokens = _usage_from_response(raw_response)
            _log_llm_request(feature, latency_ms, prompt_tokens, completion_tokens, True)
            return response
        except Exception as error:
            latency_ms = int((time.perf_counter() - started_at) * 1000)
            _log_llm_request(feature, latency_ms, None, None, False, str(error))
            if attempt >= config.LLM_MAX_BACKOFF_RETRIES or not _is_transient_error(error):
                raise
            delay = min(
                config.LLM_BACKOFF_MAX_SECONDS,
                config.LLM_BACKOFF_BASE_SECONDS * (2 ** attempt),
            )
            time.sleep(delay + random.uniform(0, 0.25))
            attempt += 1
