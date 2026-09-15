from pydantic import BaseModel, ConfigDict, EmailStr

from app.db.models.usuario import RoleUsuario


class UsuarioCreate(BaseModel):
    nome: str
    email: EmailStr
    password: str
    role: RoleUsuario = RoleUsuario.operador


class UsuarioOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    email: EmailStr
    role: RoleUsuario
    ativo: bool


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
