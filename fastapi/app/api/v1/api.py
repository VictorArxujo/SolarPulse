from fastapi import APIRouter

from app.api.v1.routers import auth, equipamentos, usinas, usuarios

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(usuarios.router)
api_router.include_router(usinas.router)
api_router.include_router(equipamentos.router)
