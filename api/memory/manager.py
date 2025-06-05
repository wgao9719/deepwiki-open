# api/memory/manager.py
from langmem import create_memory_store_manager
from langgraph.store.memory import InMemoryStore
from dataclasses import dataclass

import api.memory_cfg as config
from api.memory.semantic import vector_store   # re-use same store
                                                # (works because InMemoryStore
                                                #  satisfies BaseStore)
# 1️⃣  define schema (dataclass, Pydantic model, or JSON Schema)
@dataclass
class Triple:
    subject: str
    predicate: str
    object: str
    context: str | None = None

# 2️⃣  wire manager with schema list
manager = create_memory_store_manager(
    main_model="gpt-4o",
    schemas=[Triple],                 #  ← schema lives here
    namespace=("mem", "{namespace}", "{langgraph_user_id}"),  # match debug endpoint namespace
    store=vector_store,               #   the one from semantic.py
    enable_inserts=True, enable_deletes=True
)

async def process_turn(messages, *, user_id: str, namespace: str = "chat"):
    """Call after each user ↔ assistant exchange."""
    await manager.ainvoke(
        {"messages": messages},
        config={"configurable": {
            "langgraph_user_id": user_id,
            "namespace": namespace
        }},
    )