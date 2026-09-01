import logging
import time

from openai import OpenAI

from app.config import (
    VLLM_API_KEY,
    VLLM_BASE_URL,
    VLLM_MAX_OUTPUT_TOKENS,
    VLLM_MAX_RETRIES,
    VLLM_MODEL,
    VLLM_TEMPERATURE,
)
from app.rag.exceptions import LLMConnectionError, RAGSetupError


logger = logging.getLogger(__name__)

_client = None


def is_retryable_error(exc):
    message = str(exc).lower()
    return (
        "503" in message
        or "unavailable" in message
        or "high demand" in message
        or "429" in message
        or "rate limit" in message
        or "resource_exhausted" in message
    )


def get_llm_client():
    global _client
    if not VLLM_BASE_URL:
        raise RAGSetupError("VLLM_BASE_URL is missing. Add it to .env.")
    if not VLLM_API_KEY:
        raise RAGSetupError("VLLM_API_KEY is missing. Add it to .env.")

    if _client is None:
        _client = OpenAI(
            base_url=VLLM_BASE_URL,
            api_key=VLLM_API_KEY,
        )

    return _client


def _chat_completion(prompt, max_output_tokens=None):
    last_error = None
    for attempt in range(VLLM_MAX_RETRIES + 1):
        try:
            response = get_llm_client().chat.completions.create(
                model=VLLM_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=VLLM_TEMPERATURE,
                max_tokens=max_output_tokens or VLLM_MAX_OUTPUT_TOKENS,
            )
            answer = response.choices[0].message.content if response.choices else None
            if not answer:
                raise LLMConnectionError("vLLM returned an empty response.")
            return answer.strip()
        except Exception as exc:
            last_error = exc
            if not is_retryable_error(exc):
                logger.exception("vLLM generation failed with non-retryable error")
                raise LLMConnectionError(f"vLLM generation failed: {exc}") from exc

            logger.warning(
                "vLLM model %s failed on attempt %s/%s: %s",
                VLLM_MODEL,
                attempt + 1,
                VLLM_MAX_RETRIES + 1,
                exc,
            )
            if attempt < VLLM_MAX_RETRIES:
                time.sleep(1.5 * (attempt + 1))
                continue

            break

    raise LLMConnectionError(f"vLLM generation failed after retries: {last_error}")


def generate_legal_answer(question, context):
    prompt = f"""
You are a legal AI assistant for Indian legal materials.

Generate a clean, structured legal response.

Rules:
- Use ONLY the retrieved context.
- Do NOT use outside knowledge, assumptions, commentary, or legal advice.
- Do NOT dump the entire section text.
- Summarize clearly in plain English.
- Avoid repetition.
- Do not invent conditions, exceptions, punishments, illustrations, or consequences.
- If the retrieved context does not contain the answer, respond exactly:
Information not found in retrieved legal context.
- If punishment is not mentioned, say exactly:
No punishment specified in this section.
- If the question asks for a specific subsection or clause such as "(a)",
  "(b)", "subsection (1)", or "clause (a)", focus the answer on that exact
  part and include its condition and punishment when present in context.
- When subsections or clauses are present in retrieved context, explain the
  relevant ones under Key Conditions or Punishment instead of merging them into
  one generic summary.
- Keep response concise and readable.

Answer format:
Use these headings exactly:

{{LAW NAME}} Section {{SECTION NUMBER}}

Section Title

{{section title}}

Summary

{{2-4 plain English sentences based only on the retrieved context.}}

Key Conditions

{{bullet points for conditions explicitly present in the context. If none are present, write "No specific conditions mentioned in retrieved context."}}

Exceptions

{{bullet points for exceptions explicitly present in the context. If none are present, write "No specific exceptions mentioned in retrieved context."}}

Punishment

{{punishment explicitly stated in the context. If none is stated, write "No specific punishment mentioned in this section."}}

Source

{{law name}}, Section {{section number}}. Include retrieved document id in parentheses.

Retrieved Context:
{context}

Question:
{question}

Answer:
""".strip()

    return _chat_completion(prompt)


def generate_with_llm(prompt, max_output_tokens=None):
    return _chat_completion(prompt, max_output_tokens=max_output_tokens)
