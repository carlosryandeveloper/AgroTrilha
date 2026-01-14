from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models import (
    Template, Phase, Activity,
    Project, ChecklistItem,
    ProjectMember, User, AuditLog
)
from app.security import get_actor_user_id
from app.audit import audit

router = APIRouter(prefix="/projects", tags=["projects"])


class ProjectCreateIn(BaseModel):
    template_id: int
    client_name: str


@router.post("")
def create_project(
    payload: ProjectCreateIn,
    session: Session = Depends(get_session),
    actor_user_id: int | None = Depends(get_actor_user_id),
):
    template = session.get(Template, payload.template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado.")

    now = datetime.utcnow()
    project = Project(
        template_id=payload.template_id,
        client_name=payload.client_name,
        created_at=now,
        updated_at=now,
        created_by_user_id=actor_user_id,
        updated_by_user_id=actor_user_id,
    )
    session.add(project)
    session.commit()
    session.refresh(project)

    phases = session.exec(select(Phase).where(Phase.template_id == payload.template_id)).all()
    phase_ids = [p.id for p in phases]
    activities = session.exec(select(Activity).where(Activity.phase_id.in_(phase_ids))).all() if phase_ids else []

    for a in activities:
        item = ChecklistItem(
            project_id=project.id,
            activity_id=a.id,
            title=a.name,
            updated_at=now,
            updated_by_user_id=actor_user_id,
        )
        session.add(item)

    session.commit()

    audit(
        session,
        project_id=project.id,
        actor_user_id=actor_user_id,
        action="project.create",
        entity_type="Project",
        entity_id=project.id,
        before=None,
        after={"project": project.model_dump(), "checklist_items": len(activities)},
        note="Projeto criado e checklist gerado"
    )

    return {"project_id": project.id, "checklist_items": len(activities)}


@router.get("", response_model=List[Project])
def list_projects(session: Session = Depends(get_session)):
    return session.exec(select(Project).order_by(Project.created_at.desc())).all()


@router.get("/{project_id}/checklist")
def get_checklist(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    items = session.exec(select(ChecklistItem).where(ChecklistItem.project_id == project_id)).all()
    return {"project": project, "items": items}


class ChecklistUpdateIn(BaseModel):
    status: str | None = None
    assignee: str | None = None
    notes: str | None = None

@router.patch("/{project_id}/checklist/{item_id}")
def update_checklist_item(
    project_id: int,
    item_id: int,
    payload: ChecklistUpdateIn,
    session: Session = Depends(get_session),
    actor_user_id: int | None = Depends(get_actor_user_id),
):
    item = session.get(ChecklistItem, item_id)
    if not item or item.project_id != project_id:
        raise HTTPException(status_code=404, detail="Item não encontrado.")

    before = item.model_dump()

    if payload.status is not None:
        item.status = payload.status
    if payload.assignee is not None:
        item.assignee = payload.assignee
    if payload.notes is not None:
        item.notes = payload.notes

    item.updated_at = datetime.utcnow()
    item.updated_by_user_id = actor_user_id

    session.add(item)
    session.commit()
    session.refresh(item)

    project = session.get(Project, project_id)
    if project:
        project.updated_at = datetime.utcnow()
        project.updated_by_user_id = actor_user_id
        session.add(project)
        session.commit()

    audit(
        session,
        project_id=project_id,
        actor_user_id=actor_user_id,
        action="checklist.update",
        entity_type="ChecklistItem",
        entity_id=item.id,
        before=before,
        after=item.model_dump(),
        note="Atualização de checklist"
    )

    return item


class AddMemberIn(BaseModel):
    user_id: int
    role: str = "member"

@router.post("/{project_id}/members")
def add_member(
    project_id: int,
    payload: AddMemberIn,
    session: Session = Depends(get_session),
    actor_user_id: int | None = Depends(get_actor_user_id),
):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    user = session.get(User, payload.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")

    exists = session.get(ProjectMember, (project_id, payload.user_id))
    if exists:
        raise HTTPException(status_code=409, detail="Usuário já faz parte do projeto.")

    pm = ProjectMember(project_id=project_id, user_id=payload.user_id, role=payload.role)
    session.add(pm)

    project.updated_at = datetime.utcnow()
    project.updated_by_user_id = actor_user_id
    session.add(project)

    session.commit()

    audit(
        session,
        project_id=project_id,
        actor_user_id=actor_user_id,
        action="project.member.add",
        entity_type="ProjectMember",
        entity_id=None,
        before=None,
        after={"project_id": project_id, "user_id": payload.user_id, "role": payload.role},
        note="Membro adicionado ao projeto"
    )

    return {"ok": True}


@router.get("/{project_id}/members")
def list_members(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    members = session.exec(select(ProjectMember).where(ProjectMember.project_id == project_id)).all()
    user_ids = [m.user_id for m in members]
    users = session.exec(select(User).where(User.id.in_(user_ids))).all() if user_ids else []
    users_map = {u.id: u for u in users}

    return [
        {
            "user_id": m.user_id,
            "name": users_map.get(m.user_id).name if users_map.get(m.user_id) else None,
            "email": users_map.get(m.user_id).email if users_map.get(m.user_id) else None,
            "role": m.role,
            "joined_at": m.joined_at,
        }
        for m in members
    ]


@router.get("/{project_id}/audit")
def list_audit(project_id: int, session: Session = Depends(get_session)):
    project = session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")

    logs = session.exec(
        select(AuditLog).where(AuditLog.project_id == project_id).order_by(AuditLog.created_at.desc())
    ).all()
    return logs
