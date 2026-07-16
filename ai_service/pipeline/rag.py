"""
pipeline/rag.py
---------------
Self-Healing RAG pipeline adapted for ContrAIct.

Builds on the existing Self-Healing RAG project (LangGraph loop)
and wraps it with contract-specific context:
  - Each retrieval is scoped to ONE contract's vector store
  - The state carries contract_id and citation metadata
  - The critic validates legal-domain answers with stricter grounding

Graph topology (unchanged from original):
    [retrieve] → [generate] → [critic]
                                  |
                         grade=yes ──→ END
                                  |
                         grade=no
                                  ↓
                           [reformulate]
                                  |
                         done=True ──→ END
                                  |
                         done=False ──→ [retrieve]  ← loop
"""
from typing import TypedDict, List, Optional
from langchain_core.documents import Document
from langchain_community.vectorstores import Chroma
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END

import config


# ── State ─────────────────────────────────────────────────────────────────────

class ContractRAGState(TypedDict):
    contract_id : str
    question    : str
    documents   : List[Document]
    answer      : str
    cites       : List[str]         # clause references extracted from answer
    grade       : str               # "yes" | "no"
    attempts    : int
    done        : bool
    trace       : List[str]
    confidence  : Optional[float]   # critic confidence 0.0-1.0
    grounded    : bool


# ── Prompts ───────────────────────────────────────────────────────────────────

GENERATION_PROMPT = ChatPromptTemplate.from_template("""
You are ContrAIct, an AI legal assistant that helps users understand contracts.

Answer the user's question using ONLY the contract text provided below.

Rules:
- Be precise and cite the specific clause or section when possible.
- Format clause references as "§ <section> <title>" (e.g. "§ 9.1 Non-Compete").
- If multiple clauses are relevant, cite all of them.
- Do NOT invent information not present in the contract text.
- Do NOT use phrases like "Based on the context" or "According to the document".
- If the contract does not address the question, say:
  "This contract does not address that topic."

Contract text:
{context}

Question: {question}

Answer:
""")

CRITIC_PROMPT = ChatPromptTemplate.from_template("""
You are a legal fact-checker verifying whether an answer about a contract is accurate.

Rules:
- Reply ONLY with: yes or no
- Reply "yes" if every claim in the answer can be traced to the contract text.
- Reply "yes" if the answer says the contract does not address the topic.
- Reply "no" if the answer contains ANY information not present in the contract text.

Contract text:
{context}

Answer to verify:
{answer}

Verdict (yes/no):
""")

REFORMULATION_PROMPT = ChatPromptTemplate.from_template("""
A question about a contract could not be answered reliably.

Original question: {question}
Contract excerpt: {context}
Failed answer: {answer}

Rewrite the question using different legal terminology to retrieve better contract clauses.
Return ONLY the rewritten question, nothing else.
""")


# ── Node factories ─────────────────────────────────────────────────────────────

def make_retriever_node(vectorstore: Chroma):
    retriever = vectorstore.as_retriever(search_kwargs={"k": config.TOP_K})

    def retrieve(state: ContractRAGState) -> dict:
        docs = retriever.invoke(state["question"])
        return {
            "documents": docs,
            "trace": state.get("trace", []) + [
                f"Retrieved {len(docs)} chunk(s) for: '{state['question']}'"
            ],
        }

    return retrieve


def make_generator_node():
    llm   = ChatGroq(model=config.LLM_MODEL, temperature=0, groq_api_key=config.GROQ_API_KEY)
    chain = GENERATION_PROMPT | llm

    def generate(state: ContractRAGState) -> dict:
        context = "\n\n---\n\n".join(d.page_content for d in state["documents"])
        response = chain.invoke({"context": context, "question": state["question"]})
        answer   = response.content.strip()

        # Extract clause citations like "§ 9.1 Non-Compete"
        import re
        cites = re.findall(r"§\s*[\d.]+\s*[A-Za-z\s\-]+", answer)
        cites = [c.strip() for c in cites]

        return {
            "answer": answer,
            "cites":  cites,
            "trace":  state.get("trace", []) + [f"Generated answer ({len(answer)} chars)"],
        }

    return generate


def make_critic_node():
    llm   = ChatGroq(model=config.LLM_MODEL, temperature=0, groq_api_key=config.GROQ_API_KEY)
    chain = CRITIC_PROMPT | llm

    def critic(state: ContractRAGState) -> dict:
        context  = "\n\n---\n\n".join(d.page_content for d in state["documents"])
        response = chain.invoke({"context": context, "answer": state["answer"]})
        verdict  = response.content.strip().lower()

        if verdict not in ("yes", "no"):
            verdict = "no"

        grounded   = verdict == "yes"
        confidence = 0.95 if grounded and state.get("attempts", 0) == 0 else \
                     0.78 if grounded else 0.30

        return {
            "grade":      verdict,
            "grounded":   grounded,
            "confidence": confidence,
            "trace":      state.get("trace", []) + [f"Critic verdict: {verdict}"],
        }

    return critic


def make_reformulator_node():
    llm   = ChatGroq(model=config.LLM_MODEL, temperature=0.3, groq_api_key=config.GROQ_API_KEY)
    chain = REFORMULATION_PROMPT | llm

    def reformulate(state: ContractRAGState) -> dict:
        attempts = state.get("attempts", 0)

        if attempts >= config.MAX_RETRY_ATTEMPTS:
            return {
                "answer":     "This contract does not address that topic with sufficient detail.",
                "done":       True,
                "grounded":   False,
                "confidence": 0.1,
                "trace":      state.get("trace", []) + ["Max retries reached — exiting"],
            }

        context  = "\n\n---\n\n".join(d.page_content for d in state["documents"])
        response = chain.invoke({
            "question": state["question"],
            "context":  context,
            "answer":   state["answer"],
        })
        new_question = response.content.strip()

        return {
            "question": new_question,
            "attempts": attempts + 1,
            "done":     False,
            "trace":    state.get("trace", []) + [f"Reformulated to: '{new_question}'"],
        }

    return reformulate


# ── Graph builder ──────────────────────────────────────────────────────────────

def build_contract_pipeline(vectorstore: Chroma):
    """
    Build and compile the Self-Healing RAG graph for a specific contract.
    Identical loop structure to the original RAG project.
    """
    retrieve    = make_retriever_node(vectorstore)
    generate    = make_generator_node()
    grade       = make_critic_node()
    reformulate = make_reformulator_node()

    graph = StateGraph(ContractRAGState)
    graph.add_node("retrieve",    retrieve)
    graph.add_node("generate",    generate)
    graph.add_node("critic",      grade)
    graph.add_node("reformulate", reformulate)

    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve",    "generate")
    graph.add_edge("generate",    "critic")

    def after_critic(state: ContractRAGState) -> str:
        if state.get("done"):     return "end"
        return "end" if state["grade"] == "yes" else "reformulate"

    def after_reformulate(state: ContractRAGState) -> str:
        return "end" if state.get("done") else "retrieve"

    graph.add_conditional_edges("critic",      after_critic,
                                {"end": END, "reformulate": "reformulate"})
    graph.add_conditional_edges("reformulate", after_reformulate,
                                {"end": END, "retrieve": "retrieve"})

    return graph.compile()


# ── Public API ─────────────────────────────────────────────────────────────────

def run_contract_query(
    vectorstore: Chroma,
    contract_id: str,
    question:    str,
) -> dict:
    """
    Run a question through the Self-Healing RAG pipeline for one contract.

    Returns a dict with:
        answer      : str
        cites       : list of clause references
        confidence  : float 0.0-1.0
        attempts    : int
        grounded    : bool
        trace       : list of step descriptions
    """
    pipeline = build_contract_pipeline(vectorstore)

    result = pipeline.invoke({
        "contract_id": contract_id,
        "question":    question,
        "documents":   [],
        "answer":      "",
        "cites":       [],
        "grade":       "",
        "attempts":    0,
        "done":        False,
        "trace":       [],
        "confidence":  None,
        "grounded":    True,
    })

    return {
        "answer":     result.get("answer", ""),
        "cites":      result.get("cites", []),
        "confidence": result.get("confidence", 0.0),
        "attempts":   result.get("attempts", 0),
        "grounded":   result.get("grounded", True),
        "trace":      result.get("trace", []),
    }
