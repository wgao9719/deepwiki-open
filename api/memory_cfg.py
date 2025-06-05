EMBED_MODEL = "text-embedding-3-small"        # or sentence-transformers/all-mpnet-base-v2
LLM_MODEL   = "gpt-4o"                        # or Claude, Gemini …
MAX_EPISODIC_TURNS = 50
REFLECT_EVERY_N_TURNS = 5                     # episodic→semantic promote threshold
SEMANTIC_TOP_K = 8 