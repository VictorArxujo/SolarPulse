from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user, require_admin
from app.db.models.equipamento import Equipamento
from app.db.models.usina import Usina
from app.db.session import get_db
from app.schemas.equipamento import EquipamentoCreate, EquipamentoOut
from app.schemas.usina import TunelStatus, UsinaCreate, UsinaOut
from app.services.wireguard.status import get_tunnel_status

router = APIRouter(prefix="/usinas", tags=["usinas"])


def _get_usina_or_404(usina_id: int, db: Session) -> Usina:
    usina = db.get(Usina, usina_id)
    if usina is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Usina não encontrada"
        )
    return usina


@router.get("", response_model=list[UsinaOut], dependencies=[Depends(get_current_user)])
def listar_usinas(db: Session = Depends(get_db)) -> list[Usina]:
    return list(db.query(Usina).order_by(Usina.nome).all())


@router.post(
    "",
    response_model=UsinaOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
def criar_usina(dados: UsinaCreate, db: Session = Depends(get_db)) -> Usina:
    usina = Usina(**dados.model_dump())
    db.add(usina)
    db.commit()
    db.refresh(usina)
    return usina


@router.get(
    "/{usina_id}", response_model=UsinaOut, dependencies=[Depends(get_current_user)]
)
def obter_usina(usina_id: int, db: Session = Depends(get_db)) -> Usina:
    return _get_usina_or_404(usina_id, db)


@router.get(
    "/{usina_id}/tunnel/status",
    response_model=TunelStatus,
    dependencies=[Depends(get_current_user)],
)
def status_tunel(usina_id: int, db: Session = Depends(get_db)) -> TunelStatus:
    usina = _get_usina_or_404(usina_id, db)
    return get_tunnel_status(usina.wg_interface)


@router.get(
    "/{usina_id}/equipamentos",
    response_model=list[EquipamentoOut],
    dependencies=[Depends(get_current_user)],
)
def listar_equipamentos(usina_id: int, db: Session = Depends(get_db)) -> list[Equipamento]:
    _get_usina_or_404(usina_id, db)
    return list(db.query(Equipamento).filter(Equipamento.usina_id == usina_id).all())


@router.post(
    "/{usina_id}/equipamentos",
    response_model=EquipamentoOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
def criar_equipamento(
    usina_id: int, dados: EquipamentoCreate, db: Session = Depends(get_db)
) -> Equipamento:
    _get_usina_or_404(usina_id, db)
    equipamento = Equipamento(usina_id=usina_id, **dados.model_dump())
    db.add(equipamento)
    db.commit()
    db.refresh(equipamento)
    return equipamento
