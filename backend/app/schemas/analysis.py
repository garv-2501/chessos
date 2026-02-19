from pydantic import BaseModel

class AnalysisResponse(BaseModel):
  best_move: str | None = None
  evaluation: float | None = None
