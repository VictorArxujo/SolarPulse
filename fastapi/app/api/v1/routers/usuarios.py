from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user, require_admin
from app.core.security import hash_password
from app.db.models.usuario import Usuario
from app.db.session import get_db
from app.schemas.usuario import UsuarioCreate, UsuarioOut

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.get("/me", response_model=UsuarioOut)
def me(usuario: Usuario = Depends(get_current_user)) -> Usuario:
    return usuario


@router.post(
    "",
    response_model=UsuarioOut,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_admin)],
)
def criar_usuario(dados: UsuarioCreate, db: Session = Depends(get_db)) -> Usuario:
    if db.query(Usuario).filter(Usuario.email == dados.email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email já cadastrado"
        )

    usuario = Usuario(
        nome=dados.nome,
        email=dados.email,
        hashed_password=hash_password(dados.password),
        role=dados.role,
    )
    db.add(usuario)
    db.commit()
    db.refresh(usuario)
    return usuario
