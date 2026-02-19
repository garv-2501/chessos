from fastapi import APIRouter

router = APIRouter()

@router.get("/status")
async def play_bot_status():
  return {"status": "ready"}
