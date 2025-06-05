from collections import deque
from datetime import datetime

class EpisodicBuffer:
    def __init__(self, max_turns: int = 20):
        self.buffer: deque = deque(maxlen=max_turns)
        self.turn_no = 0

    def add_turn(self, role: str, content: str):
        self.turn_no += 1
        self.buffer.append({
            "turn": self.turn_no,
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat()
        })

    def last_n(self, n: int):
        return list(self.buffer)[-n:] 