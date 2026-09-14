import ipaddress
import shutil
import subprocess
import time

from app.core.config import settings
from app.schemas.usina import TunelStatus

# Handshakes do WireGuard se renovam a cada ~120s; acima disso o túnel é
# considerado caído.
SEGUNDOS_HANDSHAKE_VALIDO = 180


def _wg(*argumentos: str) -> tuple[bool, str]:
    """Roda `wg <argumentos>` e devolve (ok, saída) ou (False, motivo)."""
    if shutil.which("wg") is None:
        return False, "binário `wg` não encontrado"

    try:
        resultado = subprocess.run(
            ["wg", *argumentos], capture_output=True, text=True, timeout=3
        )
    except subprocess.TimeoutExpired:
        return False, "timeout ao consultar wg"

    if resultado.returncode != 0:
        return False, resultado.stderr.strip() or "interface não encontrada"

    return True, resultado.stdout


def _peer_da_subnet(saida: str, subnet: ipaddress.IPv4Network | ipaddress.IPv6Network) -> str | None:
    """Acha o peer cujo AllowedIPs cobre a sub-rede da usina.

    Saída de `wg show <iface> allowed-ips`:
        <peer_pubkey>\t<cidr> <cidr> ...
    """
    for linha in saida.splitlines():
        pubkey, _, ips = linha.partition("\t")
        for bruto in ips.split():
            try:
                rede = ipaddress.ip_network(bruto, strict=False)
            except ValueError:
                continue
            if rede.version == subnet.version and subnet.subnet_of(rede):  # type: ignore[arg-type]
                return pubkey
    return None


def _handshake_do_peer(saida: str, pubkey: str) -> int:
    """Epoch do último handshake do peer, ou 0 se nunca houve.

    Saída de `wg show <iface> latest-handshakes`: uma linha por peer, então
    é preciso casar pela chave — não dá para ler só a primeira.
    """
    for linha in saida.splitlines():
        chave, _, epoch = linha.partition("\t")
        if chave == pubkey:
            epoch = epoch.strip()
            return int(epoch) if epoch.isdigit() else 0
    return 0


def get_tunnel_status(subnet_cidr: str) -> TunelStatus:
    """Diz se o peer que atende esta sub-rede está com o túnel de pé.

    Existe uma interface WireGuard só (settings.wg_interface) com um peer por
    usina. A usina é localizada pelo AllowedIPs do peer, que é a própria
    sub-rede dela — por isso não há nome de interface guardado por usina.

    Assume que o binário `wg` está disponível no PATH do container da API, que
    compartilha o network namespace do container WireGuard
    (`network_mode: container:wireguard` no docker-compose).
    """
    iface = settings.wg_interface
    parcial = lambda **kw: TunelStatus(wg_interface=iface, up=False, **kw)  # noqa: E731

    try:
        subnet = ipaddress.ip_network(subnet_cidr.strip(), strict=False)
    except ValueError:
        return parcial(detalhe=f"sub-rede inválida: {subnet_cidr!r}")

    ok, allowed_ips = _wg("show", iface, "allowed-ips")
    if not ok:
        return parcial(detalhe=allowed_ips)

    if not allowed_ips.strip():
        return parcial(detalhe="interface sem peers configurados")

    pubkey = _peer_da_subnet(allowed_ips, subnet)
    if pubkey is None:
        return parcial(detalhe=f"nenhum peer de {iface} atende {subnet_cidr}")

    ok, handshakes = _wg("show", iface, "latest-handshakes")
    if not ok:
        return parcial(detalhe=handshakes)

    epoch = _handshake_do_peer(handshakes, pubkey)
    if epoch == 0:
        return parcial(detalhe="nunca houve handshake com este peer")

    segundos = int(time.time()) - epoch
    return TunelStatus(
        wg_interface=iface,
        up=segundos < SEGUNDOS_HANDSHAKE_VALIDO,
        ultimo_handshake_segundos=segundos,
    )
