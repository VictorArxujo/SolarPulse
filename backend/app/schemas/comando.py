from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.db.models.comando_log import AcaoComando


class ComandoRequest(BaseModel):
    acao: AcaoComando


class ComandoResultado(BaseModel):
    equipamento_id: int
    acao: AcaoComando
    sucesso: bool
    detalhe: str = ""


class ComandoLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    usuario_id: int
    equipamento_id: int
    acao: AcaoComando
    sucesso: bool
    detalhe: str
    criado_em: datetime


class ComandoLogDetalhado(ComandoLogOut):
    """Log de comando com os nomes já resolvidos — poupa o painel de log de
    fazer um lookup por equipamento/usina/usuário a mais para cada linha."""

    usuario_nome: str
    equipamento_nome: str
    usina_id: int
    usina_nome: str
