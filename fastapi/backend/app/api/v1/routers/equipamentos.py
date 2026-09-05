from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user, require_admin
from app.db.models.comando_log import AcaoComando, ComandoLog
from app.db.models.equipamento import Equipamento
from app.db.models.usuario import Usuario
from app.db.session import get_db
from app.schemas.comando import ComandoLogOut, ComandoRequest, ComandoResultado
from app.schemas.equipamento import DigirailTeste, EquipamentoOut, EquipamentoStatus, EquipamentoUpdate
from app.services.modbus.client import enviar_comando_equipamento, ler_status_equipamento, testar_digirail

router = APIRouter(
    prefix="/equipamentos", tags=["equipamentos"], dependencies=[Depends(get_current_user)]
)

ENDERECO_POR_ACAO = {
    AcaoComando.religar: "addr_ligar",
    AcaoComando.abrir: "addr_desligar",
    AcaoComando.reset: "addr_reset",
}


def _get_equipamento_or_404(equipamento_id: int, db: Session) -> Equipamento:
    equipamento = db.get(Equipamento, equipamento_id)
    if equipamento is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Equipamento não encontrado"
        )
    return equipamento


@router.get("/{equipamento_id}", response_model=EquipamentoOut)
def obter_equipamento(equipamento_id: int, db: Session = Depends(get_db)) -> Equipamento:
    return _get_equipamento_or_404(equipamento_id, db)


@router.put(
    "/{equipamento_id}", response_model=EquipamentoOut, dependencies=[Depends(require_admin)]
)
def editar_equipamento(
    equipamento_id: int, dados: EquipamentoUpdate, db: Session = Depends(get_db)
) -> Equipamento:
    equipamento = _get_equipamento_or_404(equipamento_id, db)
    for campo, valor in dados.model_dump().items():
        setattr(equipamento, campo, valor)
    db.commit()
    db.refresh(equipamento)
    return equipamento


@router.get("/{equipamento_id}/status", response_model=EquipamentoStatus)
async def status_equipamento(equipamento_id: int, db: Session = Depends(get_db)) -> EquipamentoStatus:
    equipamento = _get_equipamento_or_404(equipamento_id, db)

    fechado, detalhe = await ler_status_equipamento(
        equipamento.ip_rele, equipamento.porta_rele, equipamento.unit_id_rele, equipamento.registrador_status
    )

    return EquipamentoStatus(
        equipamento_id=equipamento.id,
        online=fechado is not None,
        fechado=fechado,
        detalhe=detalhe,
    )


@router.post("/{equipamento_id}/digirail/teste", response_model=DigirailTeste)
async def testar_digirail_equipamento(equipamento_id: int, db: Session = Depends(get_db)) -> DigirailTeste:
    equipamento = _get_equipamento_or_404(equipamento_id, db)

    ok, detalhe = await testar_digirail(equipamento.ip_digirail, equipamento.porta_digirail)

    return DigirailTeste(equipamento_id=equipamento.id, ok=ok, detalhe=detalhe)


@router.post("/{equipamento_id}/comando", response_model=ComandoResultado)
async def comandar_equipamento(
    equipamento_id: int,
    dados: ComandoRequest,
    db: Session = Depends(get_db),
    usuario: Usuario = Depends(get_current_user),
) -> ComandoResultado:
    equipamento = _get_equipamento_or_404(equipamento_id, db)

    # Segurança: só manda o pulso se o DigiRail responder agora — nunca
    # confia num teste feito antes (a rede pode ter caído nesse meio tempo).
    digirail_ok, digirail_detalhe = await testar_digirail(equipamento.ip_digirail, equipamento.porta_digirail)
    if not digirail_ok:
        log = ComandoLog(
            usuario_id=usuario.id,
            equipamento_id=equipamento.id,
            acao=dados.acao,
            sucesso=False,
            detalhe=f"Comando bloqueado — DigiRail não respondeu: {digirail_detalhe}",
        )
        db.add(log)
        db.commit()
        return ComandoResultado(
            equipamento_id=equipamento.id,
            acao=dados.acao,
            sucesso=False,
            detalhe=log.detalhe,
        )

    endereco = getattr(equipamento, ENDERECO_POR_ACAO[dados.acao])
    sucesso, detalhe = await enviar_comando_equipamento(
        equipamento.ip_digirail, equipamento.porta_digirail, equipamento.unit_id_digirail, endereco
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
