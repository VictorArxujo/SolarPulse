import shutil
import subprocess
import time

from app.schemas.usina import TunelStatus


def get_tunnel_status(wg_interface: str) -> TunelStatus:
    """Consulta `wg show <interface>` para saber se o túnel está de pé.

    Assume que o binário `wg` está disponível no PATH do container da API
    (que compartilha o network namespace do container WireGuard via
    `network_mode: service:wireguard` no docker-compose).
    """
    if shutil.which("wg") is None:
        return TunelStatus(
            wg_interface=wg_interface, up=False, detalhe="binário `wg` não encontrado"
        )

    try:
        resultado = subprocess.run(
            ["wg", "show", wg_interface, "latest-handshakes"],
            capture_output=True,
            text=True,
            timeout=3,
        )
    except subprocess.TimeoutExpired:
        return TunelStatus(wg_interface=wg_interface, up=False, detalhe="timeout ao consultar wg")

    if resultado.returncode != 0:
        return TunelStatus(
            wg_interface=wg_interface,
            up=False,
            detalhe=resultado.stderr.strip() or "interface não encontrada",
        )

    linha = resultado.stdout.strip()
    if not linha:
        return TunelStatus(wg_interface=wg_interface, up=False, detalhe="sem peers configurados")

    # saída: "<peer_pubkey>\t<epoch_do_ultimo_handshake>"
    _, _, epoch_str = linha.partition("\t")
    epoch = int(epoch_str) if epoch_str.strip().isdigit() else 0

    if epoch == 0:
        return TunelStatus(wg_interface=wg_interface, up=False, detalhe="nunca houve handshake")

    segundos_desde_handshake = int(time.time()) - epoch
    # handshakes do WireGuard se renovam a cada ~120s; acima disso, consideramos o túnel caído
    up = segundos_desde_handshake < 180

    return TunelStatus(
        wg_interface=wg_interface,
        up=up,
        ultimo_handshake_segundos=segundos_desde_handshake,
    )
