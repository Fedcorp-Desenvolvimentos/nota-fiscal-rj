# Deploy do front (notas.fedcorp.com.br)

Front (SPA React 19 + Vite 7) e API Django ficam na **mesma origem**:

- Front: `https://notas.fedcorp.com.br/`
- API:   `https://notas.fedcorp.com.br/api/`

Servidos pelo **Caddy** no droplet `137.184.53.184`. O build estático fica em
`/opt/nfse/front/dist` (usuário `deploy`). O Caddy entrega os arquivos do `dist`, com
fallback para `index.html` (rotas do BrowserRouter, ex.: `/consultas`), e faz proxy de `/api/*` para o Django.

## Variáveis de build

O Vite embute as variáveis no bundle **no momento do build** (não existem em runtime).
Modelo em `.env.example`:

| Variável            | Produção                 | Dev local                    |
|---------------------|--------------------------|------------------------------|
| `VITE_API_BASE_URL` | vazio (= mesma origem)   | `http://localhost:8000`      |
| `VITE_N8N_URL`      | **dono deve definir**    | URL do n8n/ngrok, se usar    |

Os caminhos da API no código já começam com `/api/`, por isso vazio funciona em produção.

O `.env` **saiu do git** (`git rm --cached .env`; `.env` e `.env.*` estão no `.gitignore`,
exceto `.env.example`). Cada máquina mantém o seu `.env` local. Atenção: o Vite lê o `.env`
local no build, por isso passe as variáveis explicitamente na linha de comando ao buildar para produção
(variáveis do shell têm prioridade sobre o `.env`).

## Build

Requer Node **20.19+ ou 22.12+** (Vite 7). Recomendado: Node 22 (`nvm install 22 && nvm use 22`).

```bash
npm ci
VITE_API_BASE_URL="" VITE_N8N_URL="" npm run build
# conferência: não deve haver URL de ambiente da aplicação no bundle
grep -rlE "ondigitalocean|ngrok" dist/ || echo "ok"
```

(`http://localhost` aparece no bundle só como fallback interno do react-router/axios; isso é normal.)

## Publicar

```bash
rsync -az --delete dist/ deploy@137.184.53.184:/opt/nfse/front/dist/
curl -sSI https://notas.fedcorp.com.br/
```

Não precisa reiniciar o Caddy: ele serve os arquivos direto do diretório.

## Docker (opcional/legado)

O `Dockerfile` (node:22-alpine + nginx) e o `docker-compose.yml` recebem `VITE_API_BASE_URL`
e `VITE_N8N_URL` como **build args**. O deploy oficial é o rsync acima.

## Pendências para decisão do dono

### Telas que chamam rotas inexistentes no backend atual

Comportamento **não** alterado; vão falhar (404) até haver decisão:

| Tela                         | Serviço                          | Rota chamada            |
|------------------------------|----------------------------------|-------------------------|
| Emissão Individual           | `src/services/nfseService.js`    | `POST /api/nfse/emissao/` (backend tem `emissao2/`, `emissao/vr/`, `emissao/externo/`) |
| RPS                          | `src/services/nfseService.js`    | `POST /api/nfse/rps/`   |
| Exportar (Histórico)         | `src/services/historico.js`      | `POST /api/nfse/exportar/` |

### Importação Excel (ocultada)

A rota `/api/nfse/import/xlsx/` (e `/api/nfse/list/xlsx/`) foi removida do backend de propósito em
09/11/2026; uma nova importação será projetada. A entrada de menu, o card em `/emitir` e a rota
`/emitir/excel` foram comentados (`Excel.jsx` e `excelService.js` continuam no repositório).

### n8n / sincronização

- `src/services/n8n.js` usa `VITE_N8N_URL` (antes apontava fixo para um ngrok). Hoje **nenhuma tela importa
  `n8n.js`** (só o arquivo morto `src/services/notas copy.js`, comentado).
- O botão Sincronizar de Consultas já chama `POST /api/nfse/sincronizar/` (backend), que é o substituto do fluxo n8n.
- Se o n8n ainda for necessário, o dono deve definir `VITE_N8N_URL` no build de produção; senão, remover `n8n.js`.

### Outros

- Lint pré-existente: `src/services/nfseService.js` (`response` não definido) e `src/services/historico.js` (`axios` não usado).
- Bundle único de ~850 kB (aviso do Vite); considerar code-splitting depois.
