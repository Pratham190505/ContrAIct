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
LLM_REQUESTS_PER_MINUTE: int = int(os.getenv("LLM_REQUESTS_PER_MINUTE", 20))
LLM_MAX_BACKOFF_RETRIES: int = int(os.getenv("LLM_MAX_BACKOFF_RETRIES", 3))
LLM_BACKOFF_BASE_SECONDS: float = float(os.getenv("LLM_BACKOFF_BASE_SECONDS", 1.0))
LLM_BACKOFF_MAX_SECONDS: float = float(os.getenv("LLM_BACKOFF_MAX_SECONDS", 10.0))

if not GROQ_API_KEY:
    raise EnvironmentError("GROQ_API_KEY is not set. Copy .env.example to .env and add your key.")

# ── Embeddings ────────────────────────────────────────────────────────────────
EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")

# ── Retrieval ─────────────────────────────────────────────────────────────────
CHUNK_SIZE: int         = int(os.getenv("CHUNK_SIZE", 800))
CHUNK_OVERLAP: int      = int(os.getenv("CHUNK_OVERLAP", 100))
TOP_K: int              = int(os.getenv("TOP_K", 6))
MAX_RETRY_ATTEMPTS: int = min(int(os.getenv("MAX_RETRY_ATTEMPTS", 2)), 2)
ANALYSIS_TOP_K: int     = int(os.getenv("ANALYSIS_TOP_K", 14))

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR             = os.path.dirname(__file__)
UPLOAD_DIR           = os.getenv("UPLOAD_DIR", os.path.join(BASE_DIR, "..", "backend", "uploads"))
VECTORSTORE_BASE_DIR = os.getenv("VECTORSTORE_BASE_DIR", os.path.join(BASE_DIR, "vectorstores"))
CACHE_BASE_DIR       = os.getenv("CACHE_BASE_DIR", os.path.join(BASE_DIR, "cache"))
LLM_LOG_DIR          = os.getenv("LLM_LOG_DIR", os.path.join(BASE_DIR, "logs"))

# ── Backend callback ───────────────────────────────────────────────────────────
BACKEND_URL: str = os.getenv("BACKEND_URL", "http://localhost:5000")
AI_SERVICE_SECRET: str = os.getenv("AI_SERVICE_SECRET", "")

if not AI_SERVICE_SECRET:
    raise EnvironmentError("AI_SERVICE_SECRET is not set. Copy .env.example to .env and add the shared secret.")

# Ensure directories exist
os.makedirs(VECTORSTORE_BASE_DIR, exist_ok=True)
os.makedirs(CACHE_BASE_DIR, exist_ok=True)
os.makedirs(LLM_LOG_DIR, exist_ok=True)
