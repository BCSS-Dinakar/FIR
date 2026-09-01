import logging

from app.config import (
    MONGO_URI,
    DATABASE_NAME,
    COLLECTION_NAME,
    MONGO_FALLBACK,
    POSTGRES_HOST,
    POSTGRES_PORT,
    POSTGRES_DB,
    POSTGRES_USER,
    POSTGRES_PASSWORD,
)

logger = logging.getLogger(__name__)

_pg_conn = None
_mongo_collection = None


def _get_pg():
    global _pg_conn
    if _pg_conn is not None and not _pg_conn.closed:
        return _pg_conn

    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as exc:
        raise RuntimeError(
            "psycopg is required for PostgreSQL legal corpus access. "
            "Install with: pip install 'psycopg[binary]'"
        ) from exc

    _pg_conn = psycopg.connect(
        host=POSTGRES_HOST,
        port=POSTGRES_PORT,
        dbname=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        row_factory=dict_row,
    )
    return _pg_conn


def _get_mongo_collection():
    global _mongo_collection
    if _mongo_collection is not None:
        return _mongo_collection
    from pymongo import MongoClient

    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    _mongo_collection = client[DATABASE_NAME][COLLECTION_NAME]
    return _mongo_collection


def _attach_children(conn, section):
    if not section:
        return None
    section_id = section["id"]
    with conn.cursor() as cur:
        cur.execute(
            "SELECT text FROM law_explanations WHERE section_id = %s ORDER BY sort_order",
            (section_id,),
        )
        section["explanations"] = [r["text"] for r in cur.fetchall()]
        cur.execute(
            "SELECT text FROM law_illustrations WHERE section_id = %s ORDER BY sort_order",
            (section_id,),
        )
        section["illustrations"] = [r["text"] for r in cur.fetchall()]
        cur.execute(
            """
            SELECT subsection_number, text
            FROM law_subsections
            WHERE section_id = %s
            ORDER BY sort_order
            """,
            (section_id,),
        )
        subsections = []
        for sub in cur.fetchall():
            # Minimal shape for embedding.create_combined_text
            subsections.append(
                {
                    "subsection_number": sub["subsection_number"],
                    "text": sub["text"],
                    "clauses": [],
                }
            )
        section["subsections"] = subsections
        cur.execute(
            """
            SELECT clause_number, text
            FROM law_clauses
            WHERE section_id = %s AND subsection_id IS NULL
            ORDER BY sort_order
            """,
            (section_id,),
        )
        section["clauses"] = [
            {"clause_number": c["clause_number"], "text": c["text"]}
            for c in cur.fetchall()
        ]
    section["_id"] = section.get("mongo_id")
    return section


def get_all_documents():
    try:
        conn = _get_pg()
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, mongo_id, law_name, section_number, section_title,
                       chapter, chapter_title, section_text, lead_text, punishment
                FROM laws_sections
                ORDER BY law_name, section_sort NULLS LAST, section_number
                """
            )
            rows = cur.fetchall()
        return [_attach_children(conn, dict(r)) for r in rows]
    except Exception:
        logger.exception("Failed to load legal documents from PostgreSQL")
        if not MONGO_FALLBACK:
            raise
        logger.warning("fallback_source=mongo entity=laws_sections op=get_all_documents")
        return list(_get_mongo_collection().find())


def find_section(law_name, section_number):
    try:
        conn = _get_pg()
        with conn.cursor() as cur:
            if law_name:
                cur.execute(
                    """
                    SELECT id, mongo_id, law_name, section_number, section_title,
                           chapter, chapter_title, section_text, lead_text, punishment
                    FROM laws_sections
                    WHERE section_number::text = %s
                      AND UPPER(law_name) = UPPER(%s)
                    LIMIT 1
                    """,
                    (str(section_number), law_name),
                )
            else:
                cur.execute(
                    """
                    SELECT id, mongo_id, law_name, section_number, section_title,
                           chapter, chapter_title, section_text, lead_text, punishment
                    FROM laws_sections
                    WHERE section_number::text = %s
                    LIMIT 1
                    """,
                    (str(section_number),),
                )
            row = cur.fetchone()
        if row:
            return _attach_children(conn, dict(row))
        return None
    except Exception:
        logger.exception("Failed to find legal section in PostgreSQL")
        if not MONGO_FALLBACK:
            raise
        logger.warning("fallback_source=mongo entity=laws_sections op=find_section")
        collection = _get_mongo_collection()
        section_values = [str(section_number)]
        if str(section_number).isdigit():
            section_values.append(int(section_number))
        query = {"section_number": {"$in": section_values}}
        if law_name:
            query["law_name"] = {"$regex": f"^{law_name}$", "$options": "i"}
        return collection.find_one(query)


def search_laws_rag(query, law_filter=None, limit=20):
    conn = _get_pg()
    with conn.cursor() as cur:
        cur.execute(
            "SELECT * FROM search_laws_rag(%s, %s, %s)",
            (query, law_filter, limit),
        )
        return list(cur.fetchall())


def check_connection():
    try:
        conn = _get_pg()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
        return True
    except Exception:
        logger.exception("PostgreSQL ping failed")
        if not MONGO_FALLBACK:
            return False
        try:
            _get_mongo_collection().database.client.admin.command("ping")
            return True
        except Exception:
            logger.exception("MongoDB ping failed")
            return False
