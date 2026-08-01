from pydantic import BaseModel, ConfigDict


class UsinaCreate(BaseModel):
    nome: str
    localizacao: str = ""
    wg_interface: str
    subnet_cidr: str


class UsinaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    localizacao: str
    wg_interface: str
    subnet_cidr: str
    ativo: bool


class TunelStatus(BaseModel):
    wg_interface: str
    up: bool
    ultimo_handshake_segundos: int | None = None
    detalhe: str = ""
