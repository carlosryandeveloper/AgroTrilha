from sqlmodel import Session
from typing import Optional
from app.models import AuditLog

def audit(
    session: Session,
    *,
    project_id: Optional[int],
    actor_user_id: Optional[int],
    action: str,
    entity_type: str,
    entity_id: Optional[int],
    before: Optional[dict] = None,
    after: Optional[dict] = None,
    note: str = ""
) -> None:
    session.add(
        AuditLog(
            project_id=project_id,
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before=before,
            after=after,
            note=note,
        )
    )
    session.commit()
