from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db import init_db
from app.routers.users import router as users_router
from app.routers.templates import router as templates_router
from app.routers.projects import router as projects_router

app = FastAPI(title="ImplantHub API", version="0.2.1")

# MVP: CORS liberado pra não travar o front
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()

app.include_router(users_router)
app.include_router(templates_router)
app.include_router(projects_router)

@app.get("/health")
def health():
    return {"ok": True}
