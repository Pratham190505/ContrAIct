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
import time
import traceback
from contextlib import asynccontextmanager
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel

import config
from pipeline.ingestor  import ingest_contract, load_vectorstore
from pipeline.analyzer  import run_full_analysis
from pipeline.agents.chat_agent import answer_question, generate_suggested_questions


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


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status":  "ok",
        "service": "ContrAIct AI Service",
        "model":   config.LLM_MODEL,
    }


# ── POST /analyze ─────────────────────────────────────────────────────────────

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
    )
    return {"status": "processing", "contractId": req.contractId}


async def _run_analysis_and_callback(
    contract_id:  str,
    file_path:    str,
    mime_type:    str,
    callback_url: str,
):
    """Background task: ingest → analyze → POST results to backend."""
    analysis_started_at = time.perf_counter()
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
        )

        analysis = await loop.run_in_executor(
            None,
            run_full_analysis,
            raw_text,
            vectorstore,
            contract_id,
            page_count,
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
    from langchain_groq import ChatGroq
    from langchain_core.prompts import ChatPromptTemplate
    import json
    import re

    if not req.rawTextA or not req.rawTextB:
        raise HTTPException(status_code=400, detail="rawTextA and rawTextB are required")

    llm = ChatGroq(
        model=config.LLM_MODEL,
        temperature=0,
        groq_api_key=config.GROQ_API_KEY,
    )

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

    chain    = prompt | llm
    response = chain.invoke({
        "textA": req.rawTextA[:4000],
        "textB": req.rawTextB[:4000],
    })
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
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
    from reportlab.lib import colors
    from reportlab.lib.units import inch
    import tempfile

    try:
        vectorstore = load_vectorstore(req.contractId)

        # Retrieve contract summary via RAG
        result = run_contract_query_for_report(vectorstore, req.contractId)

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


def run_contract_query_for_report(vectorstore, contract_id: str) -> dict:
    """Retrieve a summary snapshot for the report via RAG."""
    from pipeline.rag import run_contract_query
    questions = [
        "What are the main terms and obligations of this contract?",
        "What are the highest risk clauses?",
        "What should be negotiated before signing?",
    ]
    results = {}
    for q in questions:
        r = run_contract_query(vectorstore, contract_id, q)
        results[q] = r.get("answer", "")
    return results


def _build_pdf(output_path: str, content: dict, contract_id: str):
    """Build a styled PDF report using ReportLab."""
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
    from reportlab.lib import colors
    from reportlab.lib.units import inch

    doc    = SimpleDocTemplate(output_path, pagesize=letter)
    styles = getSampleStyleSheet()
    story  = []

    # Title
    title_style = ParagraphStyle(
        "Title", parent=styles["Title"],
        fontSize=22, textColor=colors.HexColor("#1a1a2e"), spaceAfter=12,
    )
    story.append(Paragraph("ContrAIct — AI Analysis Report", title_style))
    story.append(Paragraph(f"Contract ID: {contract_id}", styles["Normal"]))
    story.append(Spacer(1, 0.3 * inch))

    heading_style = ParagraphStyle(
        "Heading", parent=styles["Heading2"],
        fontSize=13, textColor=colors.HexColor("#4f46e5"), spaceBefore=14,
    )

    for question, answer in content.items():
        story.append(Paragraph(question, heading_style))
        story.append(Paragraph(answer or "No information available.", styles["Normal"]))
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
