"""
main.py
-------
ContrAIct AI Service — FastAPI application

Endpoints:
  POST /analyze        → ingest + analyze a contract (called by Node backend)
  POST /chat           → answer a question via Self-Healing RAG
  POST /compare        → semantic diff between two contracts
  POST /report         → generate a PDF analysis report
  GET  /health         → health check
  GET  /questions/{id} → suggested starter questions for a contract

Flow:
  Node.js backend calls POST /analyze with file path + contractId
  → AI service ingests + analyzes
  → calls back Node.js PATCH /api/contracts/:id/analysis with results
"""
import asyncio
import os
import shutil
import time
import traceback
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks, Header
from fastapi.responses import FileResponse
from pydantic import BaseModel

import config
from pipeline.ingestor  import ingest_contract, load_vectorstore
from pipeline.analyzer  import run_full_analysis
from pipeline.agents.chat_agent import answer_question, generate_suggested_questions
from pipeline.llm_client import get_upload_call_count, invoke_llm, reset_upload_call_count


# ── App lifecycle ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    print("""
  ╔═══════════════════════════════════════════╗
  ║     ContrAIct AI Service — Ready          ║
  ║  FastAPI  |  Self-Healing RAG  |  Groq    ║
  ╚═══════════════════════════════════════════╝
    """)
    yield
    print("[ai_service] Shutting down...")


app = FastAPI(
    title="ContrAIct AI Service",
    description="Self-Healing RAG pipeline for contract risk analysis",
    version="1.0.0",
    lifespan=lifespan,
)


# ── Request / Response models ─────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    contractId:  str
    filePath:    str
    mimeType:    str
    callbackUrl: str                  # Node.js PATCH endpoint
    documentHash: Optional[str] = None


class ChatRequest(BaseModel):
    contractId: str
    question:   str


class CompareRequest(BaseModel):
    contractIdA: str
    contractIdB: str
    rawTextA:    Optional[str] = None
    rawTextB:    Optional[str] = None


class ReportRequest(BaseModel):
    contractId: str
    analysis: Optional[dict] = None


class CleanupRequest(BaseModel):
    contractId: str
    documentHash: Optional[str] = None


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status":  "ok",
        "service": "ContrAIct AI Service",
        "model":   config.LLM_MODEL,
    }


# ── POST /analyze ─────────────────────────────────────────────────────────────

def _require_backend_secret(provided_secret: str | None) -> None:
    if not config.AI_SERVICE_SECRET:
        raise HTTPException(status_code=500, detail="AI service authentication is not configured")
    if provided_secret != config.AI_SERVICE_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


async def _remove_path(path: str | Path, label: str, contract_id: str) -> dict:
    target = Path(path)
    try:
        if not target.exists():
            return {"label": label, "path": str(target), "deleted": False, "missing": True}
        if target.is_dir():
            await asyncio.to_thread(shutil.rmtree, target)
        else:
            await asyncio.to_thread(target.unlink)
        return {"label": label, "path": str(target), "deleted": True}
    except Exception as error:
        print(f"[ai_service/cleanup] WARN contractId={contract_id} label={label} path={target} error={error}")
        return {"label": label, "path": str(target), "deleted": False, "error": str(error)}


def _cache_paths_for_contract(contract_id: str, document_hash: str | None) -> list[Path]:
    paths: list[Path] = []
    if document_hash:
        paths.append(Path(config.CACHE_BASE_DIR) / document_hash)

    cache_root = Path(config.CACHE_BASE_DIR)
    if not cache_root.exists():
        return paths

    for analysis_path in cache_root.glob("*/analysis.json"):
        if analysis_path.parent in paths:
            continue
        try:
            if contract_id in analysis_path.read_text(encoding="utf-8"):
                paths.append(analysis_path.parent)
        except Exception as error:
            print(f"[ai_service/cleanup] WARN contractId={contract_id} cacheScan={analysis_path} error={error}")
    return paths


@app.post("/cleanup")
async def cleanup_contract_resources(req: CleanupRequest, x_ai_secret: Optional[str] = Header(default=None)):
    _require_backend_secret(x_ai_secret)
    started_at = time.perf_counter()

    targets = [
        (Path(config.VECTORSTORE_BASE_DIR) / req.contractId, "vectorstore"),
        (Path(os.path.dirname(__file__)) / "reports" / f"{req.contractId}-report.pdf", "aiReport"),
        (Path(os.path.dirname(__file__)) / "tmp" / req.contractId, "tmp"),
        (Path(os.path.dirname(__file__)) / "ocr" / req.contractId, "ocr"),
        (Path(os.path.dirname(__file__)) / "previews" / req.contractId, "previews"),
        (Path(os.path.dirname(__file__)) / "thumbnails" / req.contractId, "thumbnails"),
    ]
    targets.extend((path, "cache") for path in _cache_paths_for_contract(req.contractId, req.documentHash))

    results = await asyncio.gather(
        *(_remove_path(path, label, req.contractId) for path, label in targets),
        return_exceptions=False,
    )

    deleted_cache = sum(1 for item in results if item["label"] == "cache" and item.get("deleted"))
    deleted_embeddings = any(item["label"] == "vectorstore" and item.get("deleted") for item in results)
    deleted_report = any(item["label"] == "aiReport" and item.get("deleted") for item in results)
    print(
        f"[CLEANUP DONE] contractId={req.contractId} "
        f"deletedEmbeddings={deleted_embeddings} deletedCache={deleted_cache} "
        f"deletedReport={deleted_report} elapsed={time.perf_counter() - started_at:.2f}s"
    )
    return {"deleted": True, "resources": results}


@app.post("/analyze", status_code=202)
async def analyze_contract(req: AnalyzeRequest, background_tasks: BackgroundTasks):
    """
    Accepts a file path + contract ID from the Node.js backend.
    Runs the full ingestion + analysis pipeline in the background.
    Calls back the Node.js backend when done.
    """
    background_tasks.add_task(
        _run_analysis_and_callback,
        req.contractId,
        req.filePath,
        req.mimeType,
        req.callbackUrl,
        req.documentHash,
    )
    return {"status": "processing", "contractId": req.contractId}


async def _run_analysis_and_callback(
    contract_id:  str,
    file_path:    str,
    mime_type:    str,
    callback_url: str,
    document_hash: Optional[str] = None,
):
    """Background task: ingest → analyze → POST results to backend."""
    analysis_started_at = time.perf_counter()
    reset_upload_call_count(contract_id)
    print(f"[ANALYSIS START] contractId={contract_id} callbackUrl={callback_url}")

    try:
        print(f"[ai_service] Starting analysis for {contract_id}")

        # Run in thread pool (CPU-bound + blocking I/O)
        loop = asyncio.get_running_loop()

        raw_text, page_count, vectorstore = await loop.run_in_executor(
            None,
            ingest_contract,
            file_path,
            mime_type,
            contract_id,
            document_hash,
        )

        analysis = await loop.run_in_executor(
            None,
            run_full_analysis,
            raw_text,
            vectorstore,
            contract_id,
            page_count,
            document_hash,
        )

        # Callback to Node.js backend
        callback_started_at = time.perf_counter()
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.patch(
                callback_url,
                json=analysis,
                headers={"x-ai-secret": config.AI_SERVICE_SECRET},
            )
            response_body = resp.text
            print(
                f"[CALLBACK] contractId={contract_id} url={callback_url} "
                f"status={resp.status_code} elapsed={time.perf_counter() - callback_started_at:.2f}s response={response_body}"
            )
            resp.raise_for_status()

        print(f"[DONE] contractId={contract_id} elapsed={time.perf_counter() - analysis_started_at:.2f}s")
        print(f"[UPLOAD LLM CALLS] contractId={contract_id} totalApiCalls={get_upload_call_count(contract_id)}")

    except Exception as e:
        print(f"[ai_service] ERROR analyzing {contract_id}: {e}")
        print(traceback.format_exc())
        if isinstance(e, httpx.HTTPStatusError):
            response_text = e.response.text
            print(
                f"[CALLBACK ERROR] contractId={contract_id} url={callback_url} "
                f"status={e.response.status_code} response={response_text}"
            )
        # Notify backend of failure
        try:
            failure_started_at = time.perf_counter()
            async with httpx.AsyncClient(timeout=10.0) as client:
                failure_resp = await client.patch(
                    callback_url,
                    json={
                        "status": "FAILED",
                        "error":  str(e),
                    },
                    headers={"x-ai-secret": config.AI_SERVICE_SECRET},
                )
                print(
                    f"[AI CALLBACK FAILED] contractId={contract_id} url={callback_url} "
                    f"status={failure_resp.status_code} elapsed={time.perf_counter() - failure_started_at:.2f}s response={failure_resp.text}"
                )
        except Exception as callback_error:
            print(f"[AI CALLBACK FAILED] contractId={contract_id} url={callback_url} error={callback_error}")
            print(traceback.format_exc())


# ── POST /chat ────────────────────────────────────────────────────────────────

@app.post("/chat")
async def chat(req: ChatRequest):
    """
    Answer a question about a contract using Self-Healing RAG.
    Returns answer, clause citations, confidence score, and RAG metadata.
    """
    try:
        loop        = asyncio.get_event_loop()
        vectorstore = await loop.run_in_executor(
            None, load_vectorstore, req.contractId
        )
        result = await loop.run_in_executor(
            None,
            answer_question,
            req.contractId,
            req.question,
            vectorstore,
        )
        return result

    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"No vector store found for contract {req.contractId}. "
                   "Has it been analyzed yet?",
        )
    except Exception as e:
        print(f"[ai_service/chat] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── GET /questions/{contract_id} ──────────────────────────────────────────────

@app.get("/questions/{contract_id}")
async def get_suggested_questions(contract_id: str):
    """
    Generate 5 smart starter questions for a contract.
    Used by the frontend question suggester feature.
    """
    try:
        vectorstore = load_vectorstore(contract_id)

        # Get a sample of the contract text from the vector store
        retriever = vectorstore.as_retriever(search_kwargs={"k": 8})
        docs      = retriever.invoke("contract terms obligations restrictions")
        raw_text  = "\n\n".join(d.page_content for d in docs)

        loop      = asyncio.get_event_loop()
        questions = await loop.run_in_executor(
            None, generate_suggested_questions, raw_text
        )
        return {"questions": questions}

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Contract not found or not analyzed yet")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── POST /compare ─────────────────────────────────────────────────────────────

@app.post("/compare")
async def compare_contracts(req: CompareRequest):
    """
    Semantic diff between two contracts.
    Uses the LLM to identify added / removed / changed / same clauses.
    """
    from langchain_core.prompts import ChatPromptTemplate
    import json
    import re

    if not req.rawTextA or not req.rawTextB:
        raise HTTPException(status_code=400, detail="rawTextA and rawTextB are required")

    reset_upload_call_count(None)

    prompt = ChatPromptTemplate.from_template("""
You are a legal analyst comparing two versions of a contract clause by clause.

Contract A:
{textA}

Contract B:
{textB}

Compare them and identify what changed.
Classify each section as: same | added | removed | changed

Respond with ONLY a valid JSON object (no markdown):
{{
  "diff": [
    {{"kind": "same|added|removed|changed", "text": "<clause or section text>", "version": "A|B|both"}},
    ...
  ],
  "summary": "<2-3 sentence summary of key differences>"
}}
""")

    messages = prompt.invoke({
        "textA": req.rawTextA[:4000],
        "textB": req.rawTextB[:4000],
    })
    response = invoke_llm(messages, feature="compare", temperature=0)
    content  = response.content.strip()
    content  = re.sub(r"```(?:json)?", "", content).strip()

    try:
        result = json.loads(content)
        return result
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to parse comparison result")


# ── POST /report ──────────────────────────────────────────────────────────────

@app.post("/report")
async def generate_report(req: ReportRequest):
    """
    Generate a PDF analysis report for a contract.
    Returns the PDF file as a download.
    """
    try:
        if req.analysis:
            result = req.analysis
        else:
            raise HTTPException(status_code=400, detail="Stored analysis is required to generate reports")

        # Build PDF
        reports_dir = os.path.join(os.path.dirname(__file__), "reports")
        os.makedirs(reports_dir, exist_ok=True)

        pdf_path = os.path.join(reports_dir, f"{req.contractId}-report.pdf")

        _build_pdf(pdf_path, result, req.contractId)

        return FileResponse(
            pdf_path,
            media_type="application/pdf",
            filename=f"contrAIct-report-{req.contractId[:8]}.pdf",
        )

    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Contract not found or not analyzed")
    except Exception as e:
        print(f"[ai_service/report] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _build_pdf(output_path: str, content: dict, contract_id: str):
    """Build a styled PDF report using ReportLab."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors
    from reportlab.lib.units import inch
    from xml.sax.saxutils import escape

    def text(value, fallback=""):
        if value is None:
            return fallback
        if isinstance(value, float):
            return f"{value:.2f}"
        return str(value)

    def paragraph(value, style):
        safe = escape(text(value, "No information available.")).replace("\n", "<br/>")
        return Paragraph(safe or "No information available.", style)

    def bullet_items(items):
        return [paragraph(f"- {item}", styles["Normal"]) for item in items if text(item).strip()]

    doc    = SimpleDocTemplate(output_path, pagesize=letter, rightMargin=0.65 * inch, leftMargin=0.65 * inch)
    styles = getSampleStyleSheet()
    story  = []

    # Title
    title_style = ParagraphStyle(
        "Title", parent=styles["Title"],
        fontSize=22, textColor=colors.HexColor("#1a1a2e"), spaceAfter=12,
    )
    story.append(Paragraph("ContrAIct — AI Analysis Report", title_style))
    story.append(paragraph(content.get("name", f"Contract {contract_id}"), styles["Heading2"]))
    meta = [
        ["Contract ID", contract_id],
        ["Type", content.get("type", "Contract")],
        ["Party", content.get("party", "Unknown")],
        ["Pages", content.get("pages", 0)],
        ["Risk Score", f"{content.get('riskScore', 0)}/100"],
        ["Confidence", content.get("confidence", 0)],
    ]
    table = Table(
        [[paragraph(label, styles["BodyText"]), paragraph(value, styles["BodyText"])] for label, value in meta],
        colWidths=[1.5 * inch, 4.6 * inch],
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#eef2ff")),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#1e1b4b")),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#d8dee9")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(table)
    story.append(Spacer(1, 0.3 * inch))

    heading_style = ParagraphStyle(
        "Heading", parent=styles["Heading2"],
        fontSize=13, textColor=colors.HexColor("#4f46e5"), spaceBefore=14,
    )
    subheading_style = ParagraphStyle(
        "Subheading", parent=styles["Heading3"],
        fontSize=11, textColor=colors.HexColor("#111827"), spaceBefore=8,
    )

    if "summary" in content:
        story.append(Paragraph("Executive Summary", heading_style))
        story.append(paragraph(content.get("summary"), styles["Normal"]))

        clauses = content.get("clauses") or []
        if clauses:
            story.append(Paragraph("Clause Analysis", heading_style))
            for clause in clauses:
                risk = text(clause.get("risk", "unknown")).upper()
                title = text(clause.get("title", "Clause"))
                story.append(Paragraph(escape(f"{title} ({risk} risk)"), subheading_style))
                story.append(paragraph(clause.get("plain"), styles["Normal"]))
                story.append(paragraph(f"Reason: {text(clause.get('reason'))}", styles["Normal"]))
                story.append(paragraph(f"Consequences: {text(clause.get('consequences'))}", styles["Normal"]))
                story.append(paragraph(f"Negotiation: {text(clause.get('negotiation'))}", styles["Normal"]))

        obligations = content.get("obligations") or []
        if obligations:
            story.append(Paragraph("Obligations", heading_style))
            for obligation in obligations:
                due = f" (Due: {obligation.get('due')})" if obligation.get("due") else ""
                story.append(paragraph(
                    f"- {obligation.get('party', 'Party')}: {obligation.get('obligation', '')}{due}",
                    styles["Normal"],
                ))

        dates = content.get("dates") or []
        if dates:
            story.append(Paragraph("Important Dates", heading_style))
            for date in dates:
                story.append(paragraph(
                    f"- {date.get('label', 'Date')}: {date.get('date', '')} [{date.get('kind', 'review')}]",
                    styles["Normal"],
                ))

        missing = content.get("missing") or []
        if missing:
            story.append(Paragraph("Missing or Weak Areas", heading_style))
            story.extend(bullet_items(missing))

        negotiation = content.get("negotiation") or []
        if negotiation:
            story.append(Paragraph("Negotiation Tips", heading_style))
            story.extend(bullet_items(negotiation))
    else:
        for question, answer in content.items():
            story.append(Paragraph(escape(text(question)), heading_style))
            story.append(paragraph(answer, styles["Normal"]))
            story.append(Spacer(1, 0.2 * inch))

    story.append(Spacer(1, 0.4 * inch))
    story.append(Paragraph(
        "This report was generated by ContrAIct AI. It is not legal advice. "
        "Always consult a qualified attorney before signing any contract.",
        styles["Italic"],
    ))

    doc.build(story)


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )
