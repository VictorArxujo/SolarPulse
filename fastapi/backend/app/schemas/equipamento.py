from pydantic import BaseModel, ConfigDict

from app.db.models.equipamento import TipoEquipamento


class EquipamentoBase(BaseModel):
    nome: str
    tipo: TipoEquipamento = TipoEquipamento.religador

    ip_rele: str = ""
    porta_rele: int = 502
    unit_id_rele: int = 1
    modelo_rele: str = "URP 6100"
    registrador_status: int = 0

    ip_digirail: str = ""
    porta_digirail: int = 502
    unit_id_digirail: int = 1
    addr_ligar: int = 0
    addr_desligar: int = 0
    addr_reset: int = 0


class EquipamentoCreate(EquipamentoBase):
    pass


class EquipamentoUpdate(EquipamentoBase):
    ativo: bool = True


class EquipamentoOut(EquipamentoBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    usina_id: int
    ativo: bool


class EquipamentoStatus(BaseModel):
    equipamento_id: int
    online: bool
    fechado: bool | None = None
    detalhe: str = ""


class DigirailTeste(BaseModel):
    equipamento_id: int
    ok: bool
    detalhe: str = ""
