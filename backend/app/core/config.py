import os
from dataclasses import dataclass

@dataclass(frozen=True)
class Settings:
  stockfish_path: str | None = os.getenv("STOCKFISH_PATH")

settings = Settings()
