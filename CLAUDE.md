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
- `Usina` — `subnet_cidr` (sub-rede alcançada pelo túnel = `AllowedIPs` do peer)
  e `wg_public_key` (chave pública do peer, opcional e única). Uma interface
  WireGuard só atende todas as usinas (`WG_INTERFACE`, padrão `wg0`); cada usina
  é um **peer** dela. Não existe interface por usina.
- `Equipamento` — pertence a uma usina e guarda **dois endereços Modbus**:
  o **relé de proteção** (só leitura: `ip_rele`/`porta_rele`/`unit_id_rele`,
  `modelo_rele_id`, `registrador_status`) e o **DigiRail** (só escrita:
  `ip_digirail`/`porta_digirail`/`unit_id_digirail` e
  `addr_ligar`/`addr_desligar`/`addr_reset`). Lê-se de um, escreve-se no outro.
- `ModeloRele` — catálogo de modelos de relé (URP 6100, URP 600X…).
- `ComandoLog` — auditoria: usuário, ação, sucesso/falha, timestamp.

## Fluxo principal

1. Login (`/auth/login`) → JWT com `sub` (email) + `role`.
2. `GET /usinas/{id}/tunnel/status` → localiza o peer pela `wg_public_key` da
   usina; sem chave, cai no peer cujo `AllowedIPs` cobre a `subnet_cidr`
   (`wg show <iface> allowed-ips`). Lê o handshake dele em
   `wg show <iface> latest-handshakes`; < 180s = túnel "up".
3. `GET /equipamentos/{id}/status` → lê o **relé**. ATENÇÃO: hoje usa
   `read_coils` no `registrador_status`, mas o Pextron expõe **holding
   registers** — o `app_metrion`, que opera em campo, usa
   `read_holding_registers(705, count=3)` para tensões (× 120/128) e
   `read_holding_registers(780, count=3)` para as 48 bandeirolas. Contra
   hardware real a leitura atual não responde (ver README, "Estado atual").
4. `POST /equipamentos/{id}/comando` → testa o DigiRail agora (nunca confia em
   teste anterior) e, passando, faz `write_register(addr_<acao>, 1)` no
   **DigiRail**. Escreve `1` e não escreve `0` de volta: o pulso é temporizado
   no hardware — é o mesmo comportamento do `app_metrion`. Toda tentativa,
   inclusive a bloqueada, vai para `ComandoLog`.
5. Rotas de criação de usina/equipamento restritas a admin (`require_admin`).

## Estrutura de pastas (monorepo)

```
solarpulse/               (raiz do repositório)
├── backend/              FastAPI + SQLAlchemy + Alembic
├── frontend/             React + Vite + TS, servido por nginx (proxy /api -> api)
├── vpn-gateway/          stack independente só com o WireGuard
├── docker-compose.yml     alvo final: db + api + frontend, api no netns do túnel
├── docker-compose.vps.yml VPS etapa 1: sem túnel, só o frontend publica porta
├── docker-compose.lan.yml bancada local: sem túnel, portas abertas no host
└── DEPLOY.md              passo a passo do deploy
```

Os três composes fixam `name: solarpulse`, então o projeto Docker (e o volume
`solarpulse_db_data`) não dependem do nome da pasta em que o repo foi clonado.

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
- Evoluir o projeto (nova usina) = adicionar um peer na interface do
  `vpn-gateway` com o `AllowedIPs` da sub-rede dela, e cadastrar a usina com
  essa mesma `subnet_cidr`. Sem tocar em nada do backend/frontend.
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
