from sqlmodel import Session
from typing import Optional, Any
from fastapi.encoders import jsonable_encoder

from app.models import AuditLog

def audit(
    session: Session,
    *,
    project_id: Optional[int],
    actor_user_id: Optional[int],
    action: str,
    entity_type: str,
    entity_id: Optional[int],
    before: Optional[Any] = None,
    after: Optional[Any] = None,
    note: str = ""
) -> None:
    """Grava auditoria de forma segura.

    `before/after` podem conter datetime e outros tipos Python que não são JSON-serializáveis.
    O jsonable_encoder converte tudo para tipos compatíveis (datetime -> string ISO).
    """
    before_json = jsonable_encoder(before) if before is not None else None
    after_json = jsonable_encoder(after) if after is not None else None

    session.add(
        AuditLog(
            project_id=project_id,
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            before=before_json,
            after=after_json,
            note=note,
        )
    )
    session.commit()
