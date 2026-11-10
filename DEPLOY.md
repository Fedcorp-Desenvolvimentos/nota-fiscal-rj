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

## Página Configuração (modelos de emissão)

Rota `/configuracao` para gerenciar os modelos de emissão de NFS-e sem deploy. Consome `/api/nfse/config/` (contrato
em `NFS-e-Django/.claude/docs/api-config-v1.md`; endpoints centralizados em `src/services/config.js`). Abas:

- **Mapa de emissão** (`/configuracao/mapa`, aba padrão): árvore por empresa (razão social + CNPJ) com "Padrão" e uma
  linha por condição (Apólice X / Canal VR / Canal externo), cada uma com o modelo ativo e um ponto de status (verde =
  ativo, amarelo = só rascunho, cinza = sem mapeamento → cai no padrão geral). "+ Nova configuração" cria rascunho +
  regra (`POST mapa/criar/`); 409 (condição já mapeada) mostra o link para a ficha existente.
  Ficha da combinação em `/configuracao/mapa/:prestadorId/:condicao` (`GET mapa/{prestador_id}/{condicao}/`):
  formulário com **todos os parâmetros do JSON** gerado de `schema.grupos` (seções colapsáveis, ajuda e a chave do JSON
  em cinza), versão ativa travada ("Clonar para editar"), rascunho editável (salvar com motivo, dry-run, ativar com as
  mesmas travas), últimas notas, payload de exemplo (mascarado pelo servidor) e "Avançado" (hooks + JSON de
  `campos_fixos` só com as chaves não cobertas pelo formulário).
- **Prestadores** e **Auditoria**.
- **Avançado → Modelos** (`modelos`, `modelos/:id`) e **Avançado → Regras** (`regras`): visão técnica por
  código/versão e por prioridade (com simulação).
- Requer o backend com `GET mapa/`, `POST mapa/criar/`, `GET mapa/{prestador_id}/{condicao}/` e `schema.grupos`
  (§4.8/§9 do contrato). Sem eles a aba Mapa mostra erro/aviso; as demais abas continuam funcionando.

- **Acesso decidido pelo backend**: no login (e ao reabrir a sessão) o front chama `GET /api/nfse/config/me/`; o item
  "Configuração" do menu e as rotas `/configuracao/*` só aparecem se `admin_config` for `true` (senão redireciona
  para `/`). Qualquer falha nessa chamada = sem acesso.
- **Variável do backend** `NFSE_CONFIG_ADMINS`: e-mails separados por vírgula que podem usar a página; vazia = só
  superusuários do Django. A comparação é **exata, com diferença de caixa**: o e-mail precisa ser idêntico ao do
  cadastro do usuário (`Fulano@...` ≠ `fulano@...`); confira a grafia no banco antes de preencher. Definir no `.env` do Django **antes** de publicar o front; depois de
  alterar, o usuário precisa sair e entrar de novo para o menu aparecer.
- Requer o backend da `rework` com `nfse/config/` publicado; sem ele a chamada `me/` falha e a página fica oculta
  (nenhuma outra tela é afetada).
- Toda escrita pede **motivo** (≥ 5 caracteres) e entra na auditoria; mudanças valem para a fila em até 60 s.
- Travas confirmáveis: campos fiscais de prestador (não versionado; vale na hora), ativar versão sem regra ativa e
  desativar a única versão ativa abrem um modal com a mensagem do backend e "Confirmar mesmo assim" (`confirmar: true`).
  Regra inválida na ativação não aceita confirmação: corrigir as regras do clone. Após ativar, a tela mostra o resumo
  (versões desativadas, diff de regras e quantas das últimas 200 notas mudariam de modelo).
- O token da Focus nunca trafega: a tela mostra só o **nome** da variável (`token_env`) e se ela existe no servidor.

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
