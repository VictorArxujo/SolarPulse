# Deploy na VPS — Etapa 1: aplicação no ar

Objetivo desta etapa: **abrir a aplicação no navegador, logar e ver as telas.**

Fora de escopo aqui, de propósito:

- **HTTPS** — fica em `http://` por enquanto
- **Túnel WireGuard** — nenhuma usina vai responder, e o status do túnel vai
  aparecer sempre "offline". Isso é o esperado, não é defeito.

Fazer as três coisas de uma vez é onde o deploy costuma travar. Termine esta
etapa, confirme que funciona, e só então siga para o túnel.

---

## 0. Commitar e enviar (na sua máquina, antes de tudo)

A VPS vai clonar do GitHub, então o que não estiver lá não existe pra ela.

```bash
cd ~/solarpulse/fastapi
git status --short          # confira o que está pendente
git add -A
git commit -m "chave publica do peer + compose da vps"
git push origin main
```

---

## 1. Instalar o Docker na VPS

Conectado por SSH, em Ubuntu/Debian:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Saia e entre de novo no SSH (o grupo só vale em sessão nova).

**Checkpoint:**

```bash
docker run --rm hello-world
```

Se imprimir a mensagem de boas-vindas, o Docker está de pé.

---

## 2. Clonar o repositório

```bash
git clone https://github.com/VictorArxujo/SolarPulse.git
cd SolarPulse/fastapi
```

**Checkpoint:** `ls` mostra `backend/`, `frontend/`, `docker-compose.vps.yml`.

---

## 3. Criar o `backend/.env`

Ele não vem no git (é onde ficam os segredos). Copie o exemplo e **troque a
chave JWT** — a do exemplo é pública, quem tiver ela forja login de admin.

```bash
cp backend/.env.example backend/.env
nano backend/.env
```

Gere o valor com:

```bash
openssl rand -hex 32
```

e cole em `JWT_SECRET_KEY`. O resto pode ficar como está.

**Checkpoint:** `grep JWT_SECRET_KEY backend/.env` mostra 64 caracteres
aleatórios, não o texto `troque-por-um-valor-aleatorio-e-secreto`.

---

## 4. Subir a stack

```bash
docker compose -f docker-compose.vps.yml up -d --build
```

A primeira vez demora alguns minutos (compila o frontend e instala as
dependências do backend).

**Checkpoint:**

```bash
docker compose -f docker-compose.vps.yml ps
```

Os três — `db`, `api`, `frontend` — precisam estar `Up`. Se algum estiver
reiniciando, veja os logs (seção Problemas, no fim).

---

## 5. Criar as tabelas

O banco sobe vazio. As migrações criam o schema:

```bash
docker compose -f docker-compose.vps.yml exec api uv run alembic upgrade head
```

**Checkpoint:**

```bash
docker compose -f docker-compose.vps.yml exec api uv run alembic current
```

Deve imprimir o identificador da última migração.

---

## 6. Criar o usuário admin

Não existe autocadastro: o primeiro admin nasce por fora da API.

```bash
docker compose -f docker-compose.vps.yml exec api uv run python -m scripts.create_admin
```

Ele pergunta nome, email e senha. **Use uma senha de verdade** — essa tela vai
estar aberta na internet.

---

## 7. Abrir o firewall

Só duas portas precisam entrar:

```bash
sudo ufw allow 22/tcp      # SSH — libere ANTES de ativar, ou você se tranca fora
sudo ufw allow 80/tcp      # a aplicação
sudo ufw enable
sudo ufw status
```

Repare que **o banco e a api não aparecem aqui**. Eles não publicam porta
nenhuma no compose — só conversam pela rede interna do Docker, e quem fala com
a api de fora é o nginx do frontend. É de propósito.

---

## 8. Testar

No seu navegador: **`http://<ip-da-vps>`**

Deve aparecer a tela de login. Entre com o usuário do passo 6.

**O que você deve ver:** o dashboard, vazio (nenhuma usina cadastrada ainda) ou
com as usinas que você cadastrar.

**O que você NÃO vai ver funcionando, e está certo:**

- status de túnel — vai dizer offline em tudo, não há WireGuard nesta etapa
- status de relé e teste de DigiRail — nenhum equipamento é alcançável daqui

Se a tela de login apareceu e o login passou, **a etapa 1 acabou.**

---

## 9. Levar os dados (opcional)

A VPS começa com o banco vazio. Três caminhos:

**a) Cadastrar pela tela** — para um teste com uma usina só, é o mais rápido.

**b) Copiar o banco da sua máquina:**

```bash
# na sua máquina
docker exec db pg_dump -U postgres religamento > religamento.sql
scp religamento.sql usuario@ip-da-vps:~/

# na VPS
docker compose -f docker-compose.vps.yml exec -T db \
  psql -U postgres -d religamento < ~/religamento.sql
```

**c) Reimportar do app_metrion** — exige copiar `config.enc` e `chave.key` para
a VPS. São segredos; prefira (b) se possível.

---

## Comandos do dia a dia

```bash
# ver logs (Ctrl+C sai)
docker compose -f docker-compose.vps.yml logs -f api

# reiniciar um serviço
docker compose -f docker-compose.vps.yml restart api

# atualizar depois de um git push
git pull
docker compose -f docker-compose.vps.yml up -d --build

# derrubar tudo (os dados do banco ficam, estão em volume)
docker compose -f docker-compose.vps.yml down
```

---

## Problemas comuns

**A página não abre.** Confira nesta ordem: o container `frontend` está `Up`?
O firewall liberou a 80? O provedor da VPS tem um firewall próprio no painel
(Oracle, AWS e Azure têm, e ele é separado do `ufw`)?

**Abre a tela mas o login dá erro de rede.** É o nginx não alcançando a api:

```bash
docker compose -f docker-compose.vps.yml logs api
docker compose -f docker-compose.vps.yml exec frontend wget -qO- http://api:8000/health
```

O segundo comando tem que responder `{"status":"ok"}`.

**`api` reiniciando em loop.** Quase sempre é o `.env`:

```bash
docker compose -f docker-compose.vps.yml logs api | tail -30
```

Se aparecer erro de validação de `Settings`, falta variável no `backend/.env`.

**Login diz "Email ou senha incorretos" com a senha certa.** O passo 6 rodou
antes do 5? Refaça o passo 6.

---

## O que vem depois

Nesta ordem, uma de cada vez:

1. **HTTPS** — domínio grátis (DuckDNS) + Let's Encrypt. O `nginx.conf` ganha
   um bloco para a porta 443; os dois `location` atuais não mudam.
2. **Túnel WireGuard** — sobe a stack `vpn-gateway/`, e aí a aplicação passa a
   usar o `docker-compose.yml` (onde a api empresta o netns do túnel):

   ```bash
   docker compose -f docker-compose.vps.yml down
   docker compose -f vpn-gateway/docker-compose.yml up -d
   docker compose up -d
   ```

3. **Alcançar o DigiRail** — peer na ponta da usina. No teste, WireGuard no
   Windows + `netsh portproxy`; em produção, o MikroTik roteando a sub-rede.
