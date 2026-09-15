from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user, require_admin
from app.db.models.modelo_rele import ModeloRele
from app.db.session import get_db
from app.schemas.modelo_rele import ModeloReleCreate, ModeloReleOut

router = APIRouter(
    prefix="/modelos-rele", tags=["modelos-rele"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[ModeloReleOut])
def listar_modelos(db: Session = Depends(get_db)) -> list[ModeloRele]:
    return list(db.query(ModeloRele).order_by(ModeloRele.nome).all())


@router.post(
    "", response_model=ModeloReleOut, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)]
)
def criar_modelo(dados: ModeloReleCreate, db: Session = Depends(get_db)) -> ModeloRele:
    modelo = ModeloRele(**dados.model_dump())
    db.add(modelo)
    db.commit()
    db.refresh(modelo)
    return modelo
