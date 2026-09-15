"""Importa as usinas e skids do app_metrion para o banco do religamento.

O app_metrion é a versão desktop que já roda em campo; o CONFIG_USINAS dele é
a fonte de verdade dos endereços Modbus. Este script traduz aquele formato
para os models Usina/Equipamento daqui.

Lê preferencialmente o par criptografado (config.enc + chave.key), que é o
artefato que roda em produção, e cai para criptografia/config.json se o par
não estiver disponível.

Uso:
    uv run python -m scripts.importar_metrion --origem ~/app_metrion --dry-run
    uv run python -m scripts.importar_metrion --origem ~/app_metrion

É idempotente: reexecutar atualiza o que mudou em vez de duplicar.
"""

import argparse
import ipaddress
import json
import sys
from pathlib import Path

from sqlalchemy.orm import Session

from app.db.models.equipamento import Equipamento, TipoEquipamento
from app.db.models.modelo_rele import ModeloRele
from app.db.models.usina import Usina
from app.db.session import SessionLocal

# Registrador de bandeirolas de proteção que o app_metrion lê no relé
# (read_holding_registers(780, count=3) -> 48 bits de flags).
REGISTRADOR_BANDEIROLAS = 780

PORTA_MODBUS_PADRAO = 502


def carregar_config(origem: Path) -> dict:
    """Devolve o dict de configuração do app_metrion."""
    enc, chave = origem / "config.enc", origem / "chave.key"
    if enc.exists() and chave.exists():
        from cryptography.fernet import Fernet

        dados = Fernet(chave.read_bytes()).decrypt(enc.read_bytes())
        return json.loads(dados)

    plano = origem / "criptografia" / "config.json"
    if plano.exists():
        print(f"aviso: {enc.name}/{chave.name} ausentes, usando {plano}")
        return json.loads(plano.read_text(encoding="utf-8"))

    raise SystemExit(f"Nenhuma configuração encontrada em {origem}")


def ip_valido(valor: str) -> str:
    """Devolve o IP se for um IPv4 real, ou '' se for placeholder.

    O config do metrion usa '000.000.000.000' e 'XX.XX.XX.XX' para marcar
    endereço ainda não levantado em campo.
    """
    try:
        ipaddress.IPv4Address((valor or "").strip())
    except ipaddress.AddressValueError:
        return ""
    return valor.strip()


def subnet_de(ip: str) -> str:
    """Deriva a /24 do IP da usina.

    É o AllowedIPs do peer dessa usina na interface WireGuard compartilhada, e
    também como o status do túnel localiza o peer certo.
    """
    if not ip:
        return ""
    return str(ipaddress.ip_network(f"{ip}/24", strict=False))


def tipo_de(nome_skid: str) -> TipoEquipamento:
    """DJMT = disjuntor de média tensão; o resto trata-se como religador."""
    return TipoEquipamento.disjuntor if "DJMT" in nome_skid.upper() else TipoEquipamento.religador


def mapa_modelos(db: Session) -> dict[str, int]:
    return {m.nome: m.id for m in db.query(ModeloRele).all()}


def importar(db: Session, config: dict, dry_run: bool) -> None:
    usinas_cfg = config["CONFIG_USINAS"]
    modelos = mapa_modelos(db)
    avisos: list[str] = []

    for nome_usina, cfg in usinas_cfg.items():
        ip_usina = ip_valido(cfg.get("ip", ""))
        porta_usina = int(cfg.get("porta", PORTA_MODBUS_PADRAO))
        unit_id_usina = int(cfg.get("unit_id", 1))

        usina = db.query(Usina).filter(Usina.nome == nome_usina).first()
        if usina is None:
            usina = Usina(nome=nome_usina)
            db.add(usina)
            acao_usina = "criada"
        else:
            acao_usina = "atualizada"

        usina.subnet_cidr = subnet_de(ip_usina)
        db.flush()  # precisa do usina.id para os equipamentos

        print(f"\n{nome_usina}  [{acao_usina}]  subnet={usina.subnet_cidr}")

        for nome_skid, skid in cfg.get("skids", {}).items():
            ip_rele = ip_valido(skid.get("ip_rele", ""))
            ip_digirail = ip_valido(skid.get("ip_digirail", ""))

            nome_modelo = skid.get("rele_default", "URP 6100")
            modelo_id = modelos.get(nome_modelo)
            if modelo_id is None:
                novo = ModeloRele(nome=nome_modelo, fabricante="Pextron")
                db.add(novo)
                db.flush()
                modelos[nome_modelo] = modelo_id = novo.id
                avisos.append(f"modelo de relé '{nome_modelo}' não existia e foi criado")

            equipamento = (
                db.query(Equipamento)
                .filter(Equipamento.usina_id == usina.id, Equipamento.nome == nome_skid)
                .first()
            )
            if equipamento is None:
                equipamento = Equipamento(usina_id=usina.id, nome=nome_skid)
                db.add(equipamento)
                acao = "+"
            else:
                acao = "~"

            equipamento.tipo = tipo_de(nome_skid)

            equipamento.ip_rele = ip_rele
            equipamento.porta_rele = int(skid.get("porta_rele", porta_usina))
            equipamento.unit_id_rele = int(skid.get("unit_id_rele", 1))
            equipamento.modelo_rele_id = modelo_id
            equipamento.registrador_status = REGISTRADOR_BANDEIROLAS

            equipamento.ip_digirail = ip_digirail
            equipamento.porta_digirail = int(skid.get("porta_digirail", porta_usina))
            equipamento.unit_id_digirail = int(skid.get("unit_id_digirail", unit_id_usina))
            equipamento.addr_ligar = int(skid.get("addr_ligar", 0))
            equipamento.addr_desligar = int(skid.get("addr_desligar", 0))
            equipamento.addr_reset = int(skid.get("addr_reset", 0))

            # sem DigiRail não há como comandar: nasce inativo para não aparecer
            # como operável numa tela que manda pulso de verdade
            equipamento.ativo = bool(ip_digirail)

            pendencias = []
            if not ip_digirail:
                pendencias.append("SEM IP DIGIRAIL (inativo)")
            if not ip_rele:
                pendencias.append("sem IP relé (status indisponível)")
            sufixo = "  <-- " + ", ".join(pendencias) if pendencias else ""

            print(
                f"  {acao} {nome_skid:22} digirail={ip_digirail or '-':>15}:{equipamento.porta_digirail}"
                f" uid={equipamento.unit_id_digirail}"
                f" | rele={ip_rele or '-':>15} uid={equipamento.unit_id_rele} {nome_modelo}"
                f" | {equipamento.addr_ligar}/{equipamento.addr_desligar}/{equipamento.addr_reset}"
                f"{sufixo}"
            )

    if dry_run:
        db.rollback()
        print("\n[dry-run] nada foi gravado.")
    else:
        db.commit()
        print("\nImportação concluída.")

    for aviso in avisos:
        print(f"aviso: {aviso}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--origem",
        type=Path,
        default=Path.home() / "app_metrion",
        help="raiz do repositório app_metrion (padrão: ~/app_metrion)",
    )
    parser.add_argument("--dry-run", action="store_true", help="mostra o que faria, sem gravar")
    args = parser.parse_args()

    origem = args.origem.expanduser()
    if not origem.is_dir():
        raise SystemExit(f"Origem não encontrada: {origem}")

    config = carregar_config(origem)

    db = SessionLocal()
    try:
        importar(db, config, args.dry_run)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
