"""Cria (ou atualiza a senha de) o usuário admin inicial.

Uso:
    uv run python -m scripts.create_admin
"""

import getpass

from app.core.security import hash_password
from app.db.models.usuario import RoleUsuario, Usuario
from app.db.session import SessionLocal


def main() -> None:
    nome = input("Nome: ").strip()
    email = input("Email: ").strip()
    senha = getpass.getpass("Senha: ")

    db = SessionLocal()
    try:
        usuario = db.query(Usuario).filter(Usuario.email == email).first()
        if usuario is None:
            usuario = Usuario(
                nome=nome, email=email, hashed_password=hash_password(senha), role=RoleUsuario.admin
            )
            db.add(usuario)
            acao = "criado"
        else:
            usuario.hashed_password = hash_password(senha)
            usuario.role = RoleUsuario.admin
            acao = "atualizado"

        db.commit()
        print(f"Usuário admin '{email}' {acao} com sucesso.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
