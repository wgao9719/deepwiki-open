from langmem import create_memory_store_manager
from langgraph.store.memory import InMemoryStore
from dataclasses import dataclass

import api.memory_cfg as config
from api.memory.semantic import vector_store   # re-use same store

@dataclass
class Triple:
    subject: str
    predicate: str
    object: str
    context: str | None = None

manager = create_memory_store_manager(
    main_model="gpt-4o",
    schemas=[Triple],
    namespace=("mem", "{namespace}", "{langgraph_user_id}"),
    store=vector_store,
    enable_inserts=True,
    enable_deletes=True,
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