from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from app.db import get_session
from app.models import (
    Template, Phase, Activity,
    Requirement, Decision,
    ActivityRequirementLink, ActivityDecisionLink
)
from app.audit import audit
from app.security import get_actor_user_id

router = APIRouter(prefix="/templates", tags=["templates"])


class ActivityIn(BaseModel):
    name: str
    description: str = ""
    definition_of_done: str = ""

class PhaseIn(BaseModel):
    name: str
    order: int = 0
    activities: List[ActivityIn] = []

class TemplateIn(BaseModel):
    name: str
    description: str = ""
    phases: List[PhaseIn] = []


@router.post("", response_model=Template)
def create_template(
    payload: TemplateIn,
    session: Session = Depends(get_session),
    actor_user_id: int | None = Depends(get_actor_user_id),
):
    template = Template(name=payload.name, description=payload.description)
    session.add(template)
    session.commit()
    session.refresh(template)

    for ph in payload.phases:
        phase = Phase(template_id=template.id, name=ph.name, order=ph.order)
        session.add(phase)
        session.commit()
        session.refresh(phase)

        for ac in ph.activities:
            activity = Activity(
                phase_id=phase.id,
                name=ac.name,
                description=ac.description,
                definition_of_done=ac.definition_of_done,
            )
            session.add(activity)

        session.commit()

    audit(
        session,
        project_id=None,
        actor_user_id=actor_user_id,
        action="template.create",
        entity_type="Template",
        entity_id=template.id,
        before=None,
        after={"template": template.model_dump(), "phases_count": len(payload.phases)},
        note="Template criado"
    )

    return template


@router.get("", response_model=List[Template])
def list_templates(session: Session = Depends(get_session)):
    return session.exec(select(Template)).all()


@router.get("/{template_id}")
def get_template(template_id: int, session: Session = Depends(get_session)):
    template = session.get(Template, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template não encontrado.")

    phases = session.exec(
        select(Phase).where(Phase.template_id == template_id).order_by(Phase.order)
    ).all()

    out = template.model_dump()
    out["phases"] = []

    for ph in phases:
        acts = session.exec(select(Activity).where(Activity.phase_id == ph.id)).all()
        ph_out = ph.model_dump()
        ph_out["activities"] = [a.model_dump() for a in acts]
        out["phases"].append(ph_out)

    return out


class LinkReqIn(BaseModel):
    activity_id: int
    requirement_title: str
    requirement_description: str = ""

@router.post("/link-requirement")
def link_requirement(
    payload: LinkReqIn,
    session: Session = Depends(get_session),
    actor_user_id: int | None = Depends(get_actor_user_id),
):
    activity = session.get(Activity, payload.activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Atividade não encontrada.")

    req = Requirement(title=payload.requirement_title, description=payload.requirement_description)
    session.add(req)
    session.commit()
    session.refresh(req)

    link = ActivityRequirementLink(activity_id=activity.id, requirement_id=req.id)
    session.add(link)
    session.commit()

    audit(
        session,
        project_id=None,
        actor_user_id=actor_user_id,
        action="template.requirement.link",
        entity_type="ActivityRequirementLink",
        entity_id=None,
        before=None,
        after={"activity_id": activity.id, "requirement_id": req.id},
        note="Requisito linkado à atividade"
    )

    return {"ok": True, "requirement_id": req.id}


class LinkDecisionIn(BaseModel):
    activity_id: int
    decision_title: str
    decision_description: str = ""
    rationale: str = ""

@router.post("/link-decision")
def link_decision(
    payload: LinkDecisionIn,
    session: Session = Depends(get_session),
    actor_user_id: int | None = Depends(get_actor_user_id),
):
    activity = session.get(Activity, payload.activity_id)
    if not activity:
        raise HTTPException(status_code=404, detail="Atividade não encontrada.")

    d = Decision(
        title=payload.decision_title,
        description=payload.decision_description,
        rationale=payload.rationale
    )
    session.add(d)
    session.commit()
    session.refresh(d)

    link = ActivityDecisionLink(activity_id=activity.id, decision_id=d.id)
    session.add(link)
    session.commit()

    audit(
        session,
        project_id=None,
        actor_user_id=actor_user_id,
        action="template.decision.link",
        entity_type="ActivityDecisionLink",
        entity_id=None,
        before=None,
        after={"activity_id": activity.id, "decision_id": d.id},
        note="Decisão linkada à atividade"
    )

    return {"ok": True, "decision_id": d.id}
