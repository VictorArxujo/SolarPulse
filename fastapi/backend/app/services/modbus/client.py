from pymodbus.client import AsyncModbusTcpClient

from app.core.config import settings


async def _read_coils(client: AsyncModbusTcpClient, address: int, unit_id: int):
    try:
        return await client.read_coils(address, count=1, device_id=unit_id)
    except TypeError:
        return await client.read_coils(address, count=1, slave=unit_id)


async def _write_register(client: AsyncModbusTcpClient, address: int, value: int, unit_id: int):
    try:
        return await client.write_register(address, value, device_id=unit_id)
    except TypeError:
        return await client.write_register(address, value, slave=unit_id)


async def ler_status_equipamento(
    ip: str, porta: int, unit_id: int, registrador_status: int
) -> tuple[bool | None, str]:
    """Lê a coil de status do relé de proteção através do túnel WireGuard da usina."""
    client = AsyncModbusTcpClient(ip, port=porta, timeout=settings.modbus_timeout_seconds)
    try:
        await client.connect()
        if not client.connected:
            return None, "Não foi possível conectar ao relé através do túnel"

        resposta = await _read_coils(client, registrador_status, unit_id)
        if resposta.isError():
            return None, f"Erro Modbus ao ler status: {resposta}"

        return bool(resposta.bits[0]), ""
    except Exception as exc:
        return None, f"Falha de comunicação com o relé: {exc}"
    finally:
        client.close()


async def testar_digirail(ip: str, porta: int) -> tuple[bool, str]:
    """Verifica se o DigiRail responde na rede, sem enviar nenhum comando."""
    if not ip:
        return False, "DigiRail sem endereço configurado"

    client = AsyncModbusTcpClient(ip, port=porta, timeout=settings.modbus_timeout_seconds)
    try:
        await client.connect()
        if not client.connected:
            return False, "Não foi possível conectar ao DigiRail através do túnel"
        return True, "DigiRail respondendo normalmente"
    except Exception as exc:
        return False, f"Falha de comunicação com o DigiRail: {exc}"
    finally:
        client.close()


async def enviar_comando_equipamento(
    ip: str, porta: int, unit_id: int, endereco: int
) -> tuple[bool, str]:
    """Escreve um pulso (valor 1) no endereço de comando do DigiRail."""
    client = AsyncModbusTcpClient(ip, port=porta, timeout=settings.modbus_timeout_seconds)
    try:
        await client.connect()
        if not client.connected:
            return False, "Não foi possível conectar ao DigiRail através do túnel"

        resposta = await _write_register(client, endereco, 1, unit_id)
        if resposta.isError():
            return False, f"Erro Modbus ao enviar comando: {resposta}"

        return True, "Comando enviado com sucesso"
    except Exception as exc:
        return False, f"Falha de comunicação com o DigiRail: {exc}"
    finally:
        client.close()
