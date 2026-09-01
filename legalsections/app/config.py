from pathlib import Path
import os
from urllib.parse import quote_plus

from dotenv import load_dotenv

# Base Directory
BASE_DIR = Path(__file__).resolve().parent.parent
# Prefer local .env; also allow backend/.env for shared POSTGRES_* during migration.
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / "backend" / ".env")

def _get_mongo_uri():
    uri = (
        os.getenv("MONGO_URI")
        or os.getenv("MONGODB_URI")
        or "mongodb://localhost:27017/"
    ).strip()
    password = os.getenv("MONGO_PWD") or os.getenv("MONGO_PASSWORD")

    if password:
        encoded_password = quote_plus(password.strip())
        for placeholder in ("<db_password>", "<password>", "${MONGO_PWD}", "$MONGO_PWD"):
            uri = uri.replace(placeholder, encoded_password)

    return uri


# MongoDB (legacy legal fallback only)
MONGO_URI = _get_mongo_uri()
DATABASE_NAME = os.getenv(
    "DATABASE_NAME",
    os.getenv("MONGODB_DB_NAME", "legal_database")
)
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "laws_sections")
MONGO_FALLBACK = os.getenv("MONGO_FALLBACK", "true").lower() != "false"

# PostgreSQL (canonical legal corpus)
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "127.0.0.1")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB = os.getenv("POSTGRES_DB", "legislative")
POSTGRES_USER = os.getenv("POSTGRES_USER", "legislative")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "")

# Embedding Model
EMBEDDING_MODEL = os.getenv(
    "EMBEDDING_MODEL",
    "sentence-transformers/all-MiniLM-L6-v2"
)

# FAISS Index Path
FAISS_INDEX_PATH = BASE_DIR / os.getenv("FAISS_INDEX_PATH", "faiss_index")

# Chunking
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", "900"))
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", "150"))

# Retrieval
DEFAULT_TOP_K = int(os.getenv("DEFAULT_TOP_K", "5"))
MAX_TOP_K = int(os.getenv("MAX_TOP_K", "20"))
SIMILARITY_SCORE_THRESHOLD = float(
    os.getenv("SIMILARITY_SCORE_THRESHOLD", "1.35")
)

# vLLM — OpenAI-compatible text generation (shared across apps)
VLLM_BASE_URL = os.getenv("VLLM_BASE_URL", "")
VLLM_API_KEY = os.getenv("VLLM_API_KEY", "")
VLLM_MODEL = os.getenv("VLLM_MODEL", "qwen3:14b-awq")
VLLM_TEMPERATURE = float(os.getenv("VLLM_TEMPERATURE", "0.1"))
VLLM_MAX_OUTPUT_TOKENS = int(os.getenv("VLLM_MAX_OUTPUT_TOKENS", "800"))
VLLM_MAX_RETRIES = int(os.getenv("VLLM_MAX_RETRIES", "3"))
