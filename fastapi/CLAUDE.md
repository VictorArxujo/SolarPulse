# Religamento Remoto — contexto do projeto

TCC: sistema de religamento remoto de equipamentos (religadores/disjuntores) em
usinas, via Modbus TCP tunelado por WireGuard. O usuário opera pela web; o
backend fala Modbus diretamente com o equipamento através do túnel VPN.

## Stack

- **FastAPI** (Python 3.14) — API principal, `main.py` + `app/api/v1`.
- **SQLAlchemy 2.0 + Alembic** — ORM e migrações.
- **PostgreSQL 17** — banco `religamento`.
- **pymodbus** (`AsyncModbusTcpClient`) — leitura/escrita de coils Modbus TCP.
- **WireGuard** (`linuxserver/wireguard`) — túnel até a rede local de cada usina.
- **python-jose + bcrypt** — JWT + hash de senha.
- **uv** — gerenciador de dependências do backend.
- **React + Vite + TypeScript** — frontend, servido por nginx (build estático).
- **Docker Compose** — orquestração dos containers (duas stacks, ver abaixo).

## Modelo de dados

- `Usuario` — login/JWT, tem `role` (admin vs operador — admin cria usinas/equipamentos).
- `Usina` — `wg_interface` (nome da interface WireGuard dedicada, ex: `wg-usina1`),
  `subnet_cidr` (sub-rede da usina alcançada pelo túnel).
- `Equipamento` — pertence a uma usina; `ip`/`porta` (endereço Modbus dentro do
  túnel), `coil_comando` (religar/abrir), `registrador_status` (leitura de estado).
- `ComandoLog` — auditoria: usuário, ação, sucesso/falha, timestamp.

## Fluxo principal

1. Login (`/auth/login`) → JWT com `sub` (email) + `role`.
2. `GET /usinas/{id}/tunnel/status` → `wg show <interface> latest-handshakes`
   (handshake < 180s = túnel considerado "up").
3. `GET /equipamentos/{id}/status` → `read_coils` no `registrador_status`.
4. `POST /equipamentos/{id}/comando` → `write_coil` no `coil_comando`
   (`True`=religar, `False`=abrir) → resultado logado em `ComandoLog`.
5. Rotas de criação de usina/equipamento restritas a admin (`require_admin`).

## Estrutura de pastas (monorepo)

```
fastapi/
├── backend/          FastAPI + SQLAlchemy + Alembic (era a raiz do projeto)
├── frontend/         React + Vite + TS, servido por nginx (proxy /api -> api)
├── vpn-gateway/       stack independente só com o WireGuard
└── docker-compose.yml stack "religamento": db + api + frontend
```

## Arquitetura de rede

Duas stacks Docker independentes, subidas nesta ordem:

```bash
docker compose -f vpn-gateway/docker-compose.yml up -d   # 1º: cria o app_net e sobe o wireguard
docker compose up -d                                       # 2º: db + api + frontend
```

```
Stack "vpn-gateway" (vpn-gateway/docker-compose.yml, vida independente)
  container "wireguard"
    - peers: um por usina (configs em vpn-gateway/wireguard/config, fora do git)
    - cria e entra na rede "app_net", com alias de rede "api"
    - publica a porta 8000 no host (é quem "empresta" a rede pra api)

Stack "religamento" (docker-compose.yml, raiz)
  network "app_net" (external: true — já criada pelo vpn-gateway)

  api (backend/)      -> network_mode: "container:wireguard"
                          (sem rede própria; empresta 100% o netns do wireguard;
                           por isso é alcançável em "api:8000" dentro da app_net)
  frontend (frontend/) -> rede "app_net" normal; nginx faz proxy de /api/* pro
                           container api (o browser do usuário não enxerga a
                           rede Docker, só o nginx enxerga)
  db (postgres)         -> rede "app_net", isolado do resto por não ter outra
                            exposição além da app_net + porta 5433 no host (dev)
```

Pontos importantes desse desenho:
- `frontend` NUNCA compartilha netns com a VPN — só fala com a `api` via rede
  Docker normal (isolamento de responsabilidades). Quem materializa essa
  comunicação é o **nginx** do container frontend, via reverse proxy
  (`frontend/nginx.conf`), porque o JS roda no browser do usuário, que não tem
  acesso à rede interna do Docker.
- Evoluir o projeto (nova usina) = adicionar peer no `vpn-gateway`, sem tocar
  em nada do backend/frontend.
- Trade-off aceito: se o container `wireguard` reiniciar, a `api` perde rede
  até ser reiniciada também (netns compartilhado quebra o vínculo) — já existia
  no design anterior (era `network_mode: service:wireguard` no mesmo compose),
  não é regressão.
- `backend/.env` (não versionado) precisa existir antes do build/subida da
  `api` — copiar de `backend/.env.example`.

## Convenções

- Nomes de domínio (models, campos, rotas, mensagens) em português — manter
  consistência com o restante do código.
- Sem testes automatizados ainda (`tests/` existe mas vazio) — TCC em fase de
  desenvolvimento incremental, ir com calma e validar cada mudança antes de
  seguir pra próxima.
