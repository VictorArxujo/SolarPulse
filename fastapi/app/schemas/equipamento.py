from pydantic import BaseModel, ConfigDict

from app.db.models.equipamento import TipoEquipamento


class EquipamentoCreate(BaseModel):
    nome: str
    tipo: TipoEquipamento = TipoEquipamento.religador
    ip: str
    porta: int = 502
    coil_comando: int = 0
    registrador_status: int = 0


class EquipamentoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    usina_id: int
    nome: str
    tipo: TipoEquipamento
    ip: str
    porta: int
    ativo: bool


class EquipamentoStatus(BaseModel):
    equipamento_id: int
    online: bool
    fechado: bool | None = None
    detalhe: str = ""
