from pydantic import BaseModel

class MoveRequest(BaseModel):
  fen: str
  uci: str
