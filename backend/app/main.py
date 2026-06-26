from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_attendance import router as attendance_router
from app.api.routes_history import router as history_router
from app.api.routes_payroll import router as payroll_router
from app.services.history_store import init_history_db


app = FastAPI(title="Attendance Excel Processor", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(attendance_router, prefix="/api")
app.include_router(payroll_router, prefix="/api")
app.include_router(history_router, prefix="/api")


@app.on_event("startup")
def startup() -> None:
    init_history_db()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
