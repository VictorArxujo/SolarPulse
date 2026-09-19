from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user
from app.db.models.comando_log import AcaoComando, ComandoLog
from app.db.models.equipamento import Equipamento
from app.db.models.usina import Usina
from app.db.models.usuario import Usuario
from app.db.session import get_db
from app.schemas.comando import ComandoLogDetalhado

router = APIRouter(prefix="/comandos", tags=["comandos"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[ComandoLogDetalhado])
def listar_comandos(
    db: Session = Depends(get_db),
    usina_id: int | None = None,
    equipamento_id: int | None = None,
    acao: AcaoComando | None = None,
    limit: int = Query(default=100, ge=1, le=500),
) -> list[ComandoLogDetalhado]:
    query = (
        db.query(ComandoLog, Equipamento.nome, Usina.id, Usina.nome, Usuario.nome)
        .join(Equipamento, ComandoLog.equipamento_id == Equipamento.id)
        .join(Usina, Equipamento.usina_id == Usina.id)
        .join(Usuario, ComandoLog.usuario_id == Usuario.id)
    )
    if usina_id is not None:
        query = query.filter(Usina.id == usina_id)
    if equipamento_id is not None:
        query = query.filter(ComandoLog.equipamento_id == equipamento_id)
    if acao is not None:
        query = query.filter(ComandoLog.acao == acao)

    linhas = query.order_by(ComandoLog.criado_em.desc()).limit(limit).all()

    return [
        ComandoLogDetalhado(
            id=log.id,
            usuario_id=log.usuario_id,
            equipamento_id=log.equipamento_id,
            acao=log.acao,
            sucesso=log.sucesso,
            detalhe=log.detalhe,
            criado_em=log.criado_em,
            usuario_nome=usuario_nome,
            equipamento_nome=equipamento_nome,
            usina_id=linha_usina_id,
            usina_nome=usina_nome,
        )
        for log, equipamento_nome, linha_usina_id, usina_nome, usuario_nome in linhas
    ]
