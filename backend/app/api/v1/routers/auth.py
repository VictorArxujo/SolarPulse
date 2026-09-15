from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.core.security import create_access_token, verify_password
from app.db.models.usuario import Usuario
from app.db.session import get_db
from app.schemas.usuario import Token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)
) -> Token:
    usuario = db.query(Usuario).filter(Usuario.email == form_data.username).first()

    if (
        usuario is None
        or not usuario.ativo
        or not verify_password(form_data.password, usuario.hashed_password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email ou senha incorretos",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(subject=usuario.email, role=usuario.role.value)
    return Token(access_token=access_token)
