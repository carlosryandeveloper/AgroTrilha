from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, JSON


# -----------------
# CORE: TEMPLATE -> PHASE -> ACTIVITY
# -----------------

class Template(SQLModel, table=True):
    __tablename__ = "templates"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: str = ""


class Phase(SQLModel, table=True):
    __tablename__ = "phases"
    id: Optional[int] = Field(default=None, primary_key=True)
    template_id: int = Field(foreign_key="templates.id", index=True)
    name: str
    order: int = 0


class Activity(SQLModel, table=True):
    __tablename__ = "activities"
    id: Optional[int] = Field(default=None, primary_key=True)
    phase_id: int = Field(foreign_key="phases.id", index=True)
    name: str
    description: str = ""
    definition_of_done: str = ""


class Requirement(SQLModel, table=True):
    __tablename__ = "requirements"
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: str = ""


class Decision(SQLModel, table=True):
    __tablename__ = "decisions"
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: str = ""
    rationale: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ActivityRequirementLink(SQLModel, table=True):
    __tablename__ = "activity_requirements"
    activity_id: int = Field(foreign_key="activities.id", primary_key=True)
    requirement_id: int = Field(foreign_key="requirements.id", primary_key=True)


class ActivityDecisionLink(SQLModel, table=True):
    __tablename__ = "activity_decisions"
    activity_id: int = Field(foreign_key="activities.id", primary_key=True)
    decision_id: int = Field(foreign_key="decisions.id", primary_key=True)


# -----------------
# PROJECT + CHECKLIST
# -----------------

class Project(SQLModel, table=True):
    __tablename__ = "projects"
    id: Optional[int] = Field(default=None, primary_key=True)
    template_id: int = Field(foreign_key="templates.id", index=True)
    client_name: str
    status: str = "active"  # active / paused / done

    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    created_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)
    updated_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)


class ChecklistItem(SQLModel, table=True):
    __tablename__ = "checklist_items"
    id: Optional[int] = Field(default=None, primary_key=True)
    project_id: int = Field(foreign_key="projects.id", index=True)

    # ✅ AGORA É OPCIONAL: permite criar itens manuais no checklist (sem Activity)
    activity_id: Optional[int] = Field(default=None, foreign_key="activities.id", index=True)

    title: str
    status: str = "todo"  # todo / doing / done / blocked
    assignee: str = ""
    notes: str = ""

    updated_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by_user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)


# -----------------
# USERS + MEMBERSHIP
# -----------------

class User(SQLModel, table=True):
    __tablename__ = "users"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    email: str = Field(index=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ProjectMember(SQLModel, table=True):
    __tablename__ = "project_members"
    project_id: int = Field(foreign_key="projects.id", primary_key=True)
    user_id: int = Field(foreign_key="users.id", primary_key=True)

    role: str = "member"  # member / lead / viewer
    joined_at: datetime = Field(default_factory=datetime.utcnow)


# -----------------
# AUDIT LOG (quem mexeu / antes e depois)
# -----------------

class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_logs"
    id: Optional[int] = Field(default=None, primary_key=True)

    project_id: Optional[int] = Field(default=None, foreign_key="projects.id", index=True)
    actor_user_id: Optional[int] = Field(default=None, foreign_key="users.id", index=True)

    action: str = Field(index=True)       # ex: "checklist.update", "project.create"
    entity_type: str = Field(index=True)  # ex: "ChecklistItem", "Project"
    entity_id: Optional[int] = Field(default=None, index=True)

    before: Optional[dict] = Field(default=None, sa_column=Column(JSON))
    after: Optional[dict] = Field(default=None, sa_column=Column(JSON))

    created_at: datetime = Field(default_factory=datetime.utcnow)
    note: str = ""
