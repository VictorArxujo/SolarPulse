from pymodbus.client import AsyncModbusTcpClient

from app.core.config import settings


async def ler_status_equipamento(
    ip: str, porta: int, registrador_status: int
) -> tuple[bool | None, str]:
    """Lê a coil de status do equipamento através do túnel WireGuard da usina."""
    client = AsyncModbusTcpClient(ip, port=porta, timeout=settings.modbus_timeout_seconds)
    try:
        await client.connect()
        if not client.connected:
            return None, "Não foi possível conectar ao equipamento através do túnel"

        resposta = await client.read_coils(registrador_status, count=1)
        if resposta.isError():
            return None, f"Erro Modbus ao ler status: {resposta}"

        return bool(resposta.bits[0]), ""
    except Exception as exc:
        return None, f"Falha de comunicação com o equipamento: {exc}"
    finally:
        client.close()


async def enviar_comando_equipamento(
    ip: str, porta: int, coil_comando: int, fechar: bool
) -> tuple[bool, str]:
    """Escreve a coil de comando para religar (fechar=True) ou abrir (fechar=False)."""
    client = AsyncModbusTcpClient(ip, port=porta, timeout=settings.modbus_timeout_seconds)
    try:
        await client.connect()
        if not client.connected:
            return False, "Não foi possível conectar ao equipamento através do túnel"

        resposta = await client.write_coil(coil_comando, fechar)
        if resposta.isError():
            return False, f"Erro Modbus ao enviar comando: {resposta}"

        return True, "Comando enviado com sucesso"
    except Exception as exc:
        return False, f"Falha de comunicação com o equipamento: {exc}"
    finally:
        client.close()
