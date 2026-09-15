import base64

from pydantic import BaseModel, ConfigDict, field_validator


def _valida_chave_wg(valor: str | None) -> str | None:
    """Chave pública WireGuard é base64 de exatamente 32 bytes (44 chars)."""
    if not valor or not valor.strip():
        return None
    valor = valor.strip()
    try:
        bruto = base64.b64decode(valor, validate=True)
    except Exception:
        raise ValueError("chave pública WireGuard inválida (esperado base64 de 32 bytes)")
    if len(bruto) != 32:
        raise ValueError("chave pública WireGuard inválida (esperado base64 de 32 bytes)")
    return valor


class UsinaCreate(BaseModel):
    nome: str
    localizacao: str = ""
    subnet_cidr: str
    wg_public_key: str | None = None

    _checa_chave = field_validator("wg_public_key")(_valida_chave_wg)


class UsinaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    localizacao: str
    subnet_cidr: str
    wg_public_key: str | None
    ativo: bool


class TunelStatus(BaseModel):
    wg_interface: str
    up: bool
    ultimo_handshake_segundos: int | None = None
    detalhe: str = ""
