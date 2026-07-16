"""
agents/summarizer.py
--------------------
Generates a plain-English contract summary using the LLM.
Takes raw contract text → returns a 3-5 sentence summary covering:
  - What kind of contract this is
  - The main parties involved
  - Key obligations and restrictions
  - Any immediately notable red flags
"""
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
import config

SUMMARIZER_PROMPT = ChatPromptTemplate.from_template("""
You are ContrAIct, an AI legal assistant.

Read the following contract text and write a clear, plain-English summary in 3-5 sentences.

Your summary must cover:
1. What type of contract this is and who the parties are
2. The main obligations or commitments for each party
3. Key restrictions (non-compete, confidentiality, IP, etc.) if present
4. Any immediately notable risks or unusual terms

Do NOT use legal jargon. Write as if explaining to someone with no legal background.
Do NOT start with "This contract is...". Be direct and specific.

Contract text:
{text}

Summary:
""")


def generate_summary(raw_text: str) -> str:
    """
    Generate a plain-English summary of the contract.
    
    Args:
        raw_text: Full extracted contract text
        
    Returns:
        A 3-5 sentence plain-English summary string
    """
    llm   = ChatGroq(model=config.LLM_MODEL, temperature=0, groq_api_key=config.GROQ_API_KEY)
    chain = SUMMARIZER_PROMPT | llm

    # Truncate to first 6000 chars for summary (LLM context efficiency)
    truncated = raw_text[:6000]
    if len(raw_text) > 6000:
        truncated += "\n\n[... document continues ...]"

    response = chain.invoke({"text": truncated})
    return response.content.strip()
