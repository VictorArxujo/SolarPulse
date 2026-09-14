import asyncio
from collections.abc import AsyncIterator

PING_COUNT = 4
PING_TIMEOUT_SECONDS = 2


async def ping_stream(ip: str) -> AsyncIterator[str]:
    """Roda `ping` de verdade contra o IP e vai devolvendo cada linha assim
    que ela sai — pensado pra ser consumido como streaming pelo front.

    Como a API compartilha o netns do container WireGuard (network_mode:
    container:wireguard), esse ping atravessa o túnel igual atravessaria se
    rodasse dentro do próprio container do WireGuard.
    """
    try:
        processo = await asyncio.create_subprocess_exec(
            "ping",
            "-c",
            str(PING_COUNT),
            "-W",
            str(PING_TIMEOUT_SECONDS),
            ip,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
    except FileNotFoundError:
        yield "erro: binário `ping` não encontrado nesta imagem/host\n"
        return

    assert processo.stdout is not None
    while True:
        linha = await processo.stdout.readline()
        if not linha:
            break
        yield linha.decode(errors="replace")

    await processo.wait()
