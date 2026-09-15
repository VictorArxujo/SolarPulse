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


def _handshake_do_peer(saida: str, pubkey: str) -> int | None:
    """Epoch do último handshake do peer.

    Devolve 0 se o peer existe mas nunca fechou handshake, e None se o peer
    nem está na interface — são diagnósticos diferentes.

    Saída de `wg show <iface> latest-handshakes`: uma linha por peer, então
    é preciso casar pela chave — não dá para ler só a primeira.
    """
    for linha in saida.splitlines():
        chave, _, epoch = linha.partition("\t")
        if chave == pubkey:
            epoch = epoch.strip()
            return int(epoch) if epoch.isdigit() else 0
    return None


def get_tunnel_status(subnet_cidr: str, wg_public_key: str | None = None) -> TunelStatus:
    """Diz se o peer desta usina está com o túnel de pé.

    Existe uma interface WireGuard só (settings.wg_interface) com um peer por
    usina. O peer é localizado de duas formas, nesta ordem:

    1. pela chave pública da usina, quando cadastrada — é a identidade real do
       peer, e é assim que o próprio `wg` indexa tudo;
    2. pelo AllowedIPs que cobre a sub-rede da usina — usado enquanto a chave
       não estiver preenchida (a VPN pode nem existir ainda).

    Assume que o binário `wg` está disponível no PATH do container da API, que
    compartilha o network namespace do container WireGuard
    (`network_mode: container:wireguard` no docker-compose).
    """
    iface = settings.wg_interface

    def caido(detalhe: str) -> TunelStatus:
        return TunelStatus(wg_interface=iface, up=False, detalhe=detalhe)

    if wg_public_key and wg_public_key.strip():
        pubkey = wg_public_key.strip()
    else:
        try:
            subnet = ipaddress.ip_network(subnet_cidr.strip(), strict=False)
        except ValueError:
            return caido(f"sub-rede inválida: {subnet_cidr!r}")

        ok, allowed_ips = _wg("show", iface, "allowed-ips")
        if not ok:
            return caido(allowed_ips)
        if not allowed_ips.strip():
            return caido("interface sem peers configurados")

        encontrado = _peer_da_subnet(allowed_ips, subnet)
        if encontrado is None:
            return caido(f"nenhum peer de {iface} atende {subnet_cidr}")
        pubkey = encontrado

    ok, handshakes = _wg("show", iface, "latest-handshakes")
    if not ok:
        return caido(handshakes)

    epoch = _handshake_do_peer(handshakes, pubkey)
    if epoch is None:
        return caido(f"peer não encontrado em {iface}")
    if epoch == 0:
        return caido("nunca houve handshake com este peer")

    segundos = int(time.time()) - epoch
    return TunelStatus(
        wg_interface=iface,
        up=segundos < SEGUNDOS_HANDSHAKE_VALIDO,
        ultimo_handshake_segundos=segundos,
    )
