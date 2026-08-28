import json
import os
import random
import ssl
import threading
import time

import httpx
from datetime import datetime, timezone
from typing import Any

from langchain_groq import ChatGroq

import config


_rate_lock = threading.Lock()
_last_request_at = 0.0

_upload_context = threading.local()
_upload_counts: dict[str, int] = {}


# ---------------------------------------------------------------------------
# Upload/API call tracking
# ---------------------------------------------------------------------------

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
            _upload_counts[contract_id] = (
                _upload_counts.get(contract_id, 0) + 1
            )
            return _upload_counts[contract_id]

    return current


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

def _wait_for_rate_limit() -> None:
    global _last_request_at

    min_interval = 60.0 / max(
        config.LLM_REQUESTS_PER_MINUTE,
        1,
    )

    with _rate_lock:
        elapsed = time.perf_counter() - _last_request_at

        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)

        _last_request_at = time.perf_counter()


# ---------------------------------------------------------------------------
# Token usage
# ---------------------------------------------------------------------------

def _usage_from_response(
    response: Any,
) -> tuple[int | None, int | None]:

    metadata = getattr(
        response,
        "response_metadata",
        {},
    ) or {}

    usage = (
        metadata.get("token_usage")
        or metadata.get("usage")
        or getattr(
            response,
            "usage_metadata",
            None,
        )
        or {}
    )

    prompt_tokens = (
        usage.get("prompt_tokens")
        or usage.get("input_tokens")
    )

    completion_tokens = (
        usage.get("completion_tokens")
        or usage.get("output_tokens")
    )

    return prompt_tokens, completion_tokens


# ---------------------------------------------------------------------------
# Error helpers
# ---------------------------------------------------------------------------

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
        "connection",
        "connecterror",
    )

    return any(
        marker in message
        for marker in transient_markers
    )


def is_tool_use_failed(error: Exception) -> bool:
    """
    Kept for analyzer.py compatibility.

    The new structured-output path intentionally avoids
    LangChain's tool-based structured-output implementation.
    """

    message = str(error).lower()

    return (
        "tool_use_failed" in message
        or "tool choice is required" in message
        or "did not call a tool" in message
    )


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def _log_llm_request(
    feature: str,
    latency_ms: int,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    success: bool,
    error: str | None = None,
) -> None:

    os.makedirs(
        config.LLM_LOG_DIR,
        exist_ok=True,
    )

    total_calls = _increment_upload_call_count()

    record = {
        "timestamp": datetime.now(
            timezone.utc
        ).isoformat(),
        "feature": feature,
        "contractId": getattr(
            _upload_context,
            "contract_id",
            None,
        ),
        "promptTokens": prompt_tokens,
        "completionTokens": completion_tokens,
        "latencyMs": latency_ms,
        "totalApiCallsForUpload": total_calls,
        "success": success,
    }

    if error:
        record["error"] = error

    with open(
        os.path.join(
            config.LLM_LOG_DIR,
            "llm_requests.jsonl",
        ),
        "a",
        encoding="utf-8",
    ) as log_file:

        log_file.write(
            json.dumps(record) + "\n"
        )

    print(
        "[LLM REQUEST] "
        f"feature={feature} "
        f"promptTokens={prompt_tokens} "
        f"completionTokens={completion_tokens} "
        f"latencyMs={latency_ms} "
        f"totalApiCallsForUpload={total_calls} "
        f"success={success}"
    )


# ---------------------------------------------------------------------------
# LLM creation
# ---------------------------------------------------------------------------

def _create_llm(
    temperature: float = 0,
    max_tokens: int | None = None,
) -> ChatGroq:

    # Use the Windows/system SSL certificate store.
    # This fixes the local certificate verification problem
    # while keeping TLS certificate verification enabled.
    ssl_context = ssl.create_default_context()

    http_client = httpx.Client(
        verify=ssl_context,
        timeout=httpx.Timeout(120.0),
    )

    llm_kwargs: dict[str, Any] = {
        "model": config.LLM_MODEL,
        "temperature": temperature,
        "groq_api_key": config.GROQ_API_KEY,
        "http_client": http_client,
    }

    if max_tokens is not None:
        llm_kwargs["max_tokens"] = max_tokens

    # GPT-OSS supports explicit reasoning effort.
    if config.LLM_MODEL.startswith("openai/gpt-oss"):
        llm_kwargs["reasoning_effort"] = "medium"

    return ChatGroq(**llm_kwargs)


# ---------------------------------------------------------------------------
# Pydantic → JSON Schema
# ---------------------------------------------------------------------------

def _get_schema_dict(
    structured_schema: Any,
) -> dict[str, Any] | None:

    if structured_schema is None:
        return None

    # Pydantic v2
    if hasattr(
        structured_schema,
        "model_json_schema",
    ):
        return structured_schema.model_json_schema()

    # Pydantic v1
    if hasattr(
        structured_schema,
        "schema",
    ):
        return structured_schema.schema()

    return None


# ---------------------------------------------------------------------------
# Normalize schema for Groq strict mode
# ---------------------------------------------------------------------------

def _make_groq_strict_schema(
    schema: dict[str, Any],
) -> dict[str, Any]:
    """
    Recursively normalize a Pydantic JSON schema for Groq strict
    JSON Schema output.

    Groq requires additionalProperties=false on EVERY object,
    including objects inside $defs, arrays, anyOf, oneOf, etc.
    """

    schema = dict(schema)

    schema_type = schema.get("type")

    # ---------------------------------------------------------
    # OBJECT
    # ---------------------------------------------------------
    if schema_type == "object":
        schema["additionalProperties"] = False

        properties = schema.get("properties")

        if isinstance(properties, dict):
            schema["required"] = list(properties.keys())

            schema["properties"] = {
                key: (
                    _make_groq_strict_schema(value)
                    if isinstance(value, dict)
                    else value
                )
                for key, value in properties.items()
            }

    # ---------------------------------------------------------
    # ARRAY
    # ---------------------------------------------------------
    elif schema_type == "array":
        items = schema.get("items")

        if isinstance(items, dict):
            schema["items"] = _make_groq_strict_schema(items)

    # ---------------------------------------------------------
    # $defs
    # ---------------------------------------------------------
    defs = schema.get("$defs")

    if isinstance(defs, dict):
        schema["$defs"] = {
            name: (
                _make_groq_strict_schema(value)
                if isinstance(value, dict)
                else value
            )
            for name, value in defs.items()
        }

    # ---------------------------------------------------------
    # anyOf
    # ---------------------------------------------------------
    any_of = schema.get("anyOf")

    if isinstance(any_of, list):
        schema["anyOf"] = [
            _make_groq_strict_schema(item)
            if isinstance(item, dict)
            else item
            for item in any_of
        ]

    # ---------------------------------------------------------
    # oneOf
    # ---------------------------------------------------------
    one_of = schema.get("oneOf")

    if isinstance(one_of, list):
        schema["oneOf"] = [
            _make_groq_strict_schema(item)
            if isinstance(item, dict)
            else item
            for item in one_of
        ]

    # ---------------------------------------------------------
    # allOf
    # ---------------------------------------------------------
    all_of = schema.get("allOf")

    if isinstance(all_of, list):
        schema["allOf"] = [
            _make_groq_strict_schema(item)
            if isinstance(item, dict)
            else item
            for item in all_of
        ]

    return schema


# ---------------------------------------------------------------------------
# Native Groq JSON Schema invocation
# ---------------------------------------------------------------------------

def _invoke_json_schema(
    llm: ChatGroq,
    messages: Any,
    structured_schema: Any,
) -> Any:

    schema = _get_schema_dict(
        structured_schema
    )

    if not schema:
        raise ValueError(
            "structured_schema must provide a Pydantic JSON schema"
        )

    schema = _make_groq_strict_schema(
        schema
    )

    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": "contract_analysis",
            "strict": True,
            "schema": schema,
        },
    }

    # IMPORTANT:
    #
    # We call the model directly with response_format.
    #
    # We do NOT use:
    #
    #     llm.with_structured_output(...)
    #
    # because that can route structured output through
    # tool/function calling.
    #
    # GPT-OSS supports native JSON Schema structured outputs.
    return llm.invoke(
        messages,
        response_format=response_format,
    )


# ---------------------------------------------------------------------------
# Main LLM invocation
# ---------------------------------------------------------------------------

def invoke_llm(
    messages: Any,
    feature: str,
    temperature: float = 0,
    max_tokens: int | None = None,
    structured_schema: Any | None = None,
) -> Any:

    llm = _create_llm(
        temperature=temperature,
        max_tokens=max_tokens,
    )

    attempt = 0

    while True:

        _wait_for_rate_limit()

        started_at = time.perf_counter()

        try:

            # ---------------------------------------------------------------
            # STRUCTURED OUTPUT
            # ---------------------------------------------------------------

            if structured_schema is not None:

                response = _invoke_json_schema(
                    llm,
                    messages,
                    structured_schema,
                )

            # ---------------------------------------------------------------
            # NORMAL TEXT OUTPUT
            # ---------------------------------------------------------------

            else:

                response = llm.invoke(
                    messages
                )

            latency_ms = int(
                (
                    time.perf_counter()
                    - started_at
                )
                * 1000
            )

            prompt_tokens, completion_tokens = (
                _usage_from_response(response)
            )

            _log_llm_request(
                feature=feature,
                latency_ms=latency_ms,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                success=True,
            )

            return response

        except Exception as error:

            latency_ms = int(
                (
                    time.perf_counter()
                    - started_at
                )
                * 1000
            )

            _log_llm_request(
                feature=feature,
                latency_ms=latency_ms,
                prompt_tokens=None,
                completion_tokens=None,
                success=False,
                error=str(error),
            )

            # ---------------------------------------------------------------
            # STRUCTURED OUTPUT FAILURE
            # ---------------------------------------------------------------

            if is_tool_use_failed(error):

                print(
                    "[LLM] Tool/structured-output failure detected. "
                    "The request will not be retried using the same "
                    "tool-based configuration."
                )

                raise

            # ---------------------------------------------------------------
            # NON-TRANSIENT ERROR
            # ---------------------------------------------------------------

            if (
                attempt
                >= config.LLM_MAX_BACKOFF_RETRIES
                or not _is_transient_error(error)
            ):
                raise

            # ---------------------------------------------------------------
            # TRANSIENT ERROR
            # ---------------------------------------------------------------

            delay = min(
                config.LLM_BACKOFF_MAX_SECONDS,
                config.LLM_BACKOFF_BASE_SECONDS
                * (2 ** attempt),
            )

            print(
                "[LLM] Transient error. "
                f"Retrying in {delay:.2f}s "
                f"(attempt "
                f"{attempt + 1}/"
                f"{config.LLM_MAX_BACKOFF_RETRIES})"
            )

            time.sleep(
                delay
                + random.uniform(
                    0,
                    0.25,
                )
            )

            attempt += 1