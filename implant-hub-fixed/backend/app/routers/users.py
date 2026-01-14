from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models import User
from app.audit import audit
from app.security import get_actor_user_id

router = APIRouter(prefix="/users", tags=["users"])

class UserCreateIn(BaseModel):
    name: str
    email: str

@router.post("", response_model=User)
def create_user(
    payload: UserCreateIn,
    session: Session = Depends(get_session),
    actor_user_id: int | None = Depends(get_actor_user_id),
):
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Já existe usuário com este email.")

    user = User(name=payload.name, email=payload.email)
    session.add(user)
    session.commit()
    session.refresh(user)

    audit(
        session,
        project_id=None,
        actor_user_id=actor_user_id,
        action="user.create",
        entity_type="User",
        entity_id=user.id,
        before=None,
        after=user.model_dump(),
        note="Usuário criado"
    )

    return user

@router.get("", response_model=List[User])
def list_users(session: Session = Depends(get_session)):
    return session.exec(select(User).order_by(User.created_at.desc())).all()
