from __future__ import annotations

"""Semantic (long-term) memory helpers used by the AI-editor chat.

This module offers a thin wrapper around a vector store so that the rest of the
codebase can persist and retrieve *concept* memories with two simple
functions:

    add_semantic_memory(text: str, metadata: dict | None = None) -> str
    search_semantic_memory(query: str, k: int = cfg.SEMANTIC_TOP_K) -> list[dict]

It first tries to rely on LangGraph's `InMemoryStore`.  If that class is not
available (older langgraph release), we gracefully fall back to a standard
LangChain `Chroma` store.  Either way, the public API remains identical.
"""

from typing import List, Dict, Any, Optional
import uuid
import logging

import api.memory_cfg as config

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Embedding function (OpenAI for now – swap with your own if needed)
# ---------------------------------------------------------------------------
from langchain.embeddings import OpenAIEmbeddings

_embedding_fn = OpenAIEmbeddings(model=config.EMBED_MODEL)

# ---------------------------------------------------------------------------
# Store back-end selection – LangGraph InMemoryStore ➜ fallback to Chroma
# ---------------------------------------------------------------------------
_store_backend: str

try:
    from langgraph.store.memory import InMemoryStore  # type: ignore

    _VECTOR_DIMS = 1536  # ada-002 & openai:text-embedding-3-small are 1536 dims
    _store = InMemoryStore(
        index={
            "dims": _VECTOR_DIMS,
            "embed": f"openai:{config.EMBED_MODEL}",
        }
    )
    _store_backend = "in_memory_store"
    logger.info("Semantic memory initialised with LangGraph InMemoryStore")

    def _upsert(vector: List[float], metadata: Dict[str, Any]) -> str:  # noqa: D401
        """Insert or update a vector into the InMemoryStore."""
        doc_id = str(uuid.uuid4())
        _store.upsert([
            {"id": doc_id, "vector": vector, "metadata": metadata}  # type: ignore[arg-type]
        ])
        return doc_id

    def _similarity_search(vector: List[float], k: int):  # noqa: D401
        """Return metadata+score for the most similar memories."""
        results = _store.search(vector, k=k)
        return [
            {
                "id": item[0],
                "score": item[1],
                "metadata": item[2],
            }
            for item in results
        ]

except ImportError:  # pragma: no cover – LangGraph not installed
    logger.warning("LangGraph InMemoryStore unavailable – falling back to Chroma")

    from langchain.vectorstores import Chroma
    import chromadb  # type: ignore

    _chroma_client = chromadb.PersistentClient(path=".chroma/db")
    _store = Chroma(
        collection_name="ai_editor_semantic",
        client=_chroma_client,
        embedding_function=_embedding_fn,
    )
    _store_backend = "chroma"

    def _upsert(vector: List[float], metadata: Dict[str, Any]) -> str:  # noqa: D401
        doc_id = str(uuid.uuid4())
        _store.add_texts([metadata.get("text", "")], metadatas=[metadata], ids=[doc_id])
        return doc_id

    def _similarity_search(vector: List[float], k: int):  # noqa: D401
        docs_and_scores = _store.similarity_search_by_vector(vector, k=k, return_score=True)
        return [
            {
                "id": doc.metadata.get("id"),
                "score": score,
                "metadata": doc.metadata,
            }
            for doc, score in docs_and_scores
        ]

    from types import MethodType

    def _patched_search(self, first_arg, *args, **kwargs):  # type: ignore[no-self-arg]
        limit = kwargs.get("limit", 5)

        if isinstance(first_arg, list) and all(isinstance(x, (float, int)) for x in first_arg):
            return self.similarity_search_by_vector(first_arg, k=limit)

        if isinstance(first_arg, tuple):
            query_str = args[0] if args else None
            if not query_str:
                return []
            return self.similarity_search(query_str, k=limit)

        raise TypeError("Unsupported first argument type for search(): " + str(type(first_arg)))

    _store.search = MethodType(_patched_search, _store)  # type: ignore[attr-defined]

# ---------------------------------------------------------------------------
# Public API ----------------------------------------------------------------
# ---------------------------------------------------------------------------

def add_semantic_memory(text: str, metadata: Optional[Dict[str, Any]] = None) -> str:
    if metadata is None:
        metadata = {}
    vector = _embedding_fn.embed_query(text)
    doc_meta = {"text": text, **metadata}
    return _upsert(vector, doc_meta)


def search_semantic_memory(query: str, k: int = config.SEMANTIC_TOP_K):
    vector = _embedding_fn.embed_query(query)
    return _similarity_search(vector, k=k)


vector_store = _store
backend_name = _store_backend 