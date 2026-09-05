from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user
from app.db.models.comando_log import AcaoComando, ComandoLog
from app.db.models.equipamento import Equipamento
from app.db.models.usuario import Usuario
from app.db.session import get_db
from app.schemas.comando import ComandoLogOut, ComandoRequest, ComandoResultado
from app.schemas.equipamento import EquipamentoStatus
from app.services.modbus.client import enviar_comando_equipamento, ler_status_equipamento

router = APIRouter(
    prefix="/equipamentos", tags=["equipamentos"], dependencies=[Depends(get_current_user)]
)


def _get_equipamento_or_404(equipamento_id: int, db: Session) -> Equipamento:
    equipamento = db.get(Equipamento, equipamento_id)
    if equipamento is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento não encontrado"
        )
    return equipamento


@router.get("/{equipamento_id}/status", response_model=EquipamentoStatus)
async def status_equipamento(equipamento_id: int, db: Session = Depends(get_db)) -> EquipamentoStatus:
    equipamento = _get_equipamento_or_404(equipamento_id, db)

    fechado, detalhe = await ler_status_equipamento(
        equipamento.ip, equipamento.porta, equipamento.registrador_status
    )

    return EquipamentoStatus(
        equipamento_id=equipamento.id,
        online=fechado is not None,
        fechado=fechado,
        detalhe=detalhe,
    )


@router.post("/{equipamento_id}/comando", response_model=ComandoResultado)
async def comandar_equipamento(
    equipamento_id: int,
    dados: ComandoRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
) -> ComandoResultado:
    equipamento = _get_equipamento_or_404(equipamento_id, db)

    sucesso, detalhe = await enviar_comando_equipamento(
        equipamento.ip,
        equipamento.porta,
        equipamento.coil_comando,
        fechar=(dados.acao == AcaoComando.religar),
    )

    log = ComandoLog(
        usuario_id=usuario.id,
        equipamento_id=equipamento.id,
        acao=dados.acao,
        sucesso=sucesso,
        detalhe=detalhe,
    )
    db.add(log)
    db.commit()

    return ComandoResultado(
        equipamento_id=equipamento.id, acao=dados.acao, sucesso=sucesso, detalhe=detalhe
    )


@router.get("/{equipamento_id}/comandos", response_model=list[ComandoLogOut])
def historico_comandos(equipamento_id: int, db: Session = Depends(get_db)) -> list[ComandoLog]:
    _get_equipamento_or_404(equipamento_id, db)
    return list(
        db.query(ComandoLog)
        .filter(ComandoLog.equipamento_id == equipamento_id)
        .order_by(ComandoLog.criado_em.desc())
        .all()
    )
