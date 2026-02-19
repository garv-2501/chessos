from dataclasses import dataclass
from app.core.config import settings

@dataclass
class EngineStatus:
  ready: bool
  path: str | None


def get_engine_status() -> EngineStatus:
  return EngineStatus(ready=bool(settings.stockfish_path), path=settings.stockfish_path)
