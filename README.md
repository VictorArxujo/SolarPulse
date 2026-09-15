# SolarPulse — Religamento Remoto

Sistema web para **religar, abrir e resetar disjuntores e religadores** de usinas
fotovoltaicas remotamente, falando Modbus TCP através de um túnel WireGuard.

Quando a proteção de uma usina atua, hoje alguém precisa ir até lá ou usar um
aplicativo desktop de dentro da rede da planta. Este projeto move essa operação
para a web, com autenticação, controle de acesso e auditoria de cada comando.

TCC em desenvolvimento. O antecessor em produção é o `app_metrion`, um
executável desktop que roda dentro da rede da usina — é dele que vêm os mapas
Modbus e os endereços usados aqui.

---

## Arquitetura

```
  navegador
      │  http
      ▼
  ┌─────────────┐   /api/*    ┌──────────────────────────────┐
  │  frontend   │────────────▶│ api  (netns do wireguard)    │
  │   (nginx)   │  app_net    │ FastAPI + pymodbus           │
  └─────────────┘             └──────────────┬───────────────┘
         │                                   │ Modbus TCP
         │ serve o React                     ▼
         ▼                           ┌───────────────┐
   build estático                    │  túnel wg0    │
                                     └───────┬───────┘
                                             │ um peer por usina
                        ┌────────────────────┼────────────────────┐
                        ▼                    ▼                    ▼
                   PIRASSUNUNGA           ITABIRA              ...
                   10.168.68.0/24       172.27.1.0/24
```

Três decisões que explicam o resto do código:

**1. A `api` empresta o network namespace do container WireGuard**
(`network_mode: "container:wireguard"`). É assim que ela alcança os IPs das
usinas: para ela, a rede da planta é local. Como consequência, a `api` precisa
de `cap_add: NET_ADMIN` — compartilhar o netns **não** compartilha capabilities,
e a interface netlink do WireGuard exige essa capability mesmo só para ler.
Sem ela, `wg show` responde `Operation not permitted` e o status do túnel nunca
funciona, com uma mensagem idêntica à de "interface não existe".

**2. Uma interface WireGuard só, um peer por usina.** A usina é identificada
pela `wg_public_key` do peer dela; sem chave cadastrada, o sistema cai num
fallback que procura o peer cujo `AllowedIPs` cobre a `subnet_cidr` da usina.
A chave é preferida porque `AllowedIPs` pode ser ambíguo — dois peers podem
declarar a mesma sub-rede no arquivo, e aí o WireGuard atribui ao último e o
anterior perde em silêncio.

**3. O `frontend` nunca compartilha netns com a VPN.** O JavaScript roda no
navegador do usuário, que não enxerga a rede interna do Docker — quem faz a
ponte é o nginx do container do frontend, via reverse proxy (`frontend/nginx.conf`).

---

## O ponto central do domínio: dois equipamentos por skid

**Você lê de um equipamento e escreve em outro.** É o detalhe mais fácil de
esquecer ao mexer neste código.

```
Equipamento
├── RELÉ DE PROTEÇÃO  (Pextron, só LEITURA)
│     ip_rele, porta_rele, unit_id_rele, modelo_rele_id, registrador_status
│
└── DIGIRAIL  (gateway Modbus, só ESCRITA)
      ip_digirail, porta_digirail, unit_id_digirail
      addr_ligar · addr_desligar · addr_reset
```

O DigiRail tem saídas digitais ligadas **em paralelo** com os comandos manuais
do relé. Um pulso numa dessas saídas é o que atua no disjuntor.

### Contrato Modbus (extraído do `app_metrion`, que opera em campo)

| operação | função | endereço | observação |
|---|---|---|---|
| tensões VA/VB/VC | `read_holding_registers` | 705, count 3 | valor × 120/128 |
| bandeirolas de proteção | `read_holding_registers` | 780, count 3 | 48 bits de flags |
| comando | `write_register` | `addr_ligar`/`desligar`/`reset`, valor `1` | — |

O comando escreve `1` e **não escreve `0` de volta** — o pulso é temporizado no
próprio DigiRail, configurado por hardware. Isso é intencional e igual ao que o
`app_metrion` faz em produção.

---

## Modelo de dados

| Tabela | Papel |
|---|---|
| `usuarios` | login/JWT; `role` admin ou operador |
| `usinas` | `subnet_cidr` (= `AllowedIPs` do peer) e `wg_public_key` (opcional) |
| `modelos_rele` | catálogo (URP 6100, URP 600X…) |
| `equipamentos` | relé + DigiRail, conforme acima |
| `comando_logs` | auditoria: quem, qual ação, deu certo?, quando |

Toda tentativa de comando é registrada — inclusive as bloqueadas por o DigiRail
não responder.

---

## Rodando localmente

Requer Docker. O `backend/.env` não vem no git:

```bash
cp backend/.env.example backend/.env
# gere um segredo: openssl rand -hex 32  → cole em JWT_SECRET_KEY

docker compose -f docker-compose.lan.yml up -d --build
docker compose -f docker-compose.lan.yml exec api uv run alembic upgrade head
docker compose -f docker-compose.lan.yml exec api uv run python -m scripts.create_admin
```

Aplicação em **http://localhost:8081**.

Sem túnel nesta stack: o status de todas as usinas aparece offline e nenhum
equipamento responde. É o esperado.

### Os três composes

| arquivo | para quê | túnel | portas publicadas |
|---|---|---|---|
| `docker-compose.lan.yml` | bancada local | não | frontend 8081, api 8000, db 5433 |
| `docker-compose.vps.yml` | VPS, etapa 1 | não | só frontend (80) |
| `docker-compose.yml` | alvo final | sim, via `vpn-gateway/` | via o container wireguard |

Os três fixam `name: solarpulse`, então o projeto Docker e o volume
`solarpulse_db_data` não dependem do nome da pasta onde o repo foi clonado.

Com túnel, a ordem importa — o `vpn-gateway` cria a rede `app_net` e o netns
que a `api` empresta:

```bash
docker compose -f vpn-gateway/docker-compose.yml up -d
docker compose up -d
```

---

## Deploy

Passo a passo completo em **[DEPLOY.md](DEPLOY.md)** — instalação do Docker,
clone, `.env`, migrações, admin, firewall, e os problemas comuns.

O roteiro é deliberadamente incremental: primeiro a aplicação no ar em `http://`
sem túnel, depois TLS, depois o WireGuard. Fazer as três coisas juntas é onde
o deploy trava.

---

## Scripts

```bash
# primeiro admin (não existe autocadastro)
uv run python -m scripts.create_admin

# importa usinas e skids do app_metrion (lê config.enc + chave.key)
uv run python -m scripts.importar_metrion --origem ~/app_metrion --dry-run
```

O importador é idempotente: reexecutar atualiza o que mudou em vez de duplicar.
Ele deriva a `subnet_cidr` do IP da usina e trata `000.000.000.000` e
`XX.XX.XX.XX` como "endereço ainda não levantado em campo".

---

## Estado atual

**Funciona:** login e RBAC, cadastro de usinas/equipamentos/modelos, status do
túnel por peer, teste de vida do DigiRail, ping ICMP em streaming, envio de
comando com confirmação e auditoria, importação do `app_metrion`.

**Ainda não funciona / pendências conhecidas:**

- **Leitura de status do equipamento.** `ler_status_equipamento` usa
  `read_coils`, mas o relé Pextron expõe **holding registers** (FC3, não FC1).
  Contra hardware real isso nunca vai responder, independente do endereço. E não
  existe um bit "disjuntor fechado" no relé — o `app_metrion` mostra tensão e
  bandeirolas, e o operador infere. O campo `EquipamentoStatus.fechado` não tem
  origem real hoje.
- **Tensões e bandeirolas** (registradores 705 e 780) não foram implementadas.
- **`ativo` não protege nada.** A rota de comando não consulta esse campo — um
  equipamento marcado como inativo continua comandável pela API.
- **`ComandoLog.detalhe` é `String(255)`** e recebe mensagens de exceção do
  pymodbus. Uma exceção longa estoura o INSERT justamente no caminho de erro.
- **Sem testes automatizados.** `backend/tests/` existe e está vazio.

---

## Segurança

- `backend/.env` e `vpn-gateway/wireguard/config/` estão no `.gitignore` —
  segredo de JWT e chaves privadas do túnel nunca vão para o repositório.
- A `api` roda com `CAP_NET_ADMIN`. É o necessário para ler o estado do túnel,
  mas dá àquele container poder de reconfigurar a rede do namespace que ele
  divide com a VPN. A alternativa sem capability seria o container `wireguard`
  publicar a saída de `wg show` num volume compartilhado.
- **Uma máquina com túnel ativo para usina real comanda disjuntor de verdade.**
  Não restaure um dump com as usinas de produção num ambiente de teste que tenha
  esse túnel ligado: basta um clique na tela para atuar em campo.
