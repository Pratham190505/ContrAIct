"""
agents/chat_agent.py
--------------------
Handles the contract chat feature using Self-Healing RAG.

When a user asks a question about their contract:
1. The question is run through the full Self-Healing RAG pipeline
   (retrieve → generate → critic → [reformulate → retrieve ...] → answer)
2. Clause citations are extracted from the answer
3. The result is returned with confidence score, retry count, and grounding flag

This is the primary consumer of pipeline/rag.py.
"""
from langchain_community.vectorstores import Chroma
from pipeline.rag import run_contract_query
from pipeline.ingestor import load_vectorstore
from pipeline.llm_client import reset_upload_call_count


def answer_question(
    contract_id: str,
    question:    str,
    vectorstore: Chroma | None = None,
) -> dict:
    """
    Answer a user question about a specific contract using Self-Healing RAG.

    Args:
        contract_id : used to load the right vector store if not provided
        question    : user's natural-language question
        vectorstore : optional pre-loaded Chroma instance (avoids re-loading)

    Returns:
        {
            answer     : str,
            cites      : list[str],   # e.g. ["§ 9.1 Non-Compete"]
            confidence : float,
            attempts   : int,
            grounded   : bool,
            trace      : list[str],
        }
    """
    if vectorstore is None:
        vectorstore = load_vectorstore(contract_id)

    reset_upload_call_count(None)
    return run_contract_query(
        vectorstore=vectorstore,
        contract_id=contract_id,
        question=question,
    )


def generate_suggested_questions(raw_text: str) -> list[str]:
    """
    Generate 5 smart starter questions based on the contract content.
    Used for the question suggester feature in the chat UI.
    """
    from langchain_core.prompts import ChatPromptTemplate
    import json
    import re
    from pipeline.llm_client import invoke_llm

    reset_upload_call_count(None)
    prompt = ChatPromptTemplate.from_template("""
You are ContrAIct, an AI legal assistant.

Based on this contract, generate exactly 5 smart questions a user should ask
before signing. Focus on the most important risks, unusual clauses, and
obligations.

Contract text:
{text}

Respond with ONLY a JSON array of 5 question strings (no markdown):
["<question 1>", "<question 2>", "<question 3>", "<question 4>", "<question 5>"]
""")

    messages = prompt.invoke({"text": raw_text[:5000]})
    response = invoke_llm(messages, feature="suggested_questions", temperature=0.3)
    content  = response.content.strip()
    content  = re.sub(r"```(?:json)?", "", content).strip()

    try:
        questions = json.loads(content)
        return questions[:5]
    except Exception:
        # Fallback generic questions
        return [
            "What are my termination rights under this contract?",
            "Are there any non-compete restrictions?",
            "Who owns any work or inventions I create?",
            "What are the payment terms and penalties?",
            "What happens if there is a dispute?",
        ]
