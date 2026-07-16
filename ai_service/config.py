"""
config.py
---------
Central settings for the ContrAIct AI service.
All modules import from here — never hardcode values elsewhere.
"""
import os
from dotenv import load_dotenv

load_dotenv()

# ── LLM ───────────────────────────────────────────────────────────────────────
GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")
LLM_MODEL: str    = os.getenv("LLM_MODEL", "llama-3.1-8b-instant")

if not GROQ_API_KEY:
    raise EnvironmentError("GROQ_API_KEY is not set. Copy .env.example to .env and add your key.")

# ── Embeddings ────────────────────────────────────────────────────────────────
EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

# ── Retrieval ─────────────────────────────────────────────────────────────────
CHUNK_SIZE: int         = int(os.getenv("CHUNK_SIZE", 800))
CHUNK_OVERLAP: int      = int(os.getenv("CHUNK_OVERLAP", 100))
TOP_K: int              = int(os.getenv("TOP_K", 6))
MAX_RETRY_ATTEMPTS: int = int(os.getenv("MAX_RETRY_ATTEMPTS", 2))

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR             = os.path.dirname(__file__)
UPLOAD_DIR           = os.getenv("UPLOAD_DIR", os.path.join(BASE_DIR, "..", "backend", "uploads"))
VECTORSTORE_BASE_DIR = os.getenv("VECTORSTORE_BASE_DIR", os.path.join(BASE_DIR, "vectorstores"))

# ── Backend callback ───────────────────────────────────────────────────────────
BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:5000")

# Ensure directories exist
os.makedirs(VECTORSTORE_BASE_DIR, exist_ok=True)
