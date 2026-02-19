from fastapi import FastAPI
from app.api.v1.routes.health import router as health_router
from app.api.v1.routes.play_bot import router as play_bot_router

app = FastAPI(title="chessOS API", version="0.1.0")

app.include_router(health_router, prefix="/api/v1", tags=["health"])
app.include_router(play_bot_router, prefix="/api/v1/play-bot", tags=["play-bot"])
