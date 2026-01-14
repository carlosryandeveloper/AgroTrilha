from sqlmodel import SQLModel, create_engine, Session
import os
import time
from sqlalchemy.exc import OperationalError

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./dev.db")
engine = create_engine(DATABASE_URL, echo=False)

def init_db(retries: int = 20, delay_seconds: float = 1.5) -> None:
    """Cria as tabelas. Em Docker, o Postgres pode demorar alguns segundos.
    Fazemos retry para evitar o backend morrer na largada.
    """
    last_err = None
    for i in range(retries):
        try:
            SQLModel.metadata.create_all(engine)
            return
        except OperationalError as e:
            last_err = e
            time.sleep(delay_seconds)
    # se não conseguiu, joga o erro pra aparecer no log
    raise last_err

def get_session():
    with Session(engine) as session:
        yield session
