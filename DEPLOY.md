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

### Camadas fixas (decisão do dono, 10/11/2026)

Não existe mais prioridade numérica para escolher ou editar. Toda nota é resolvida por **camadas fixas**, nesta ordem
(a primeira que casar define o modelo):

| Ordem | Camada (`chave` no backend) | Número (só informativo) | O que casa | Como nasce |
|---|---|---|---|---|
| 1 | **Canal da empresa** (`canal_empresa`) | 5 | empresa + canal VR/externo | Mapa → "Canal (VR / externo)" |
| 2 | **Canal** (`canais`) | 10–39 | canais de entrada externo/VR (transversais, todas as empresas) | backend |
| 3 | **Apólice** (`apolice`) | 900 | Empresa + Apólice (todas na mesma camada; vence a mais específica) | Mapa → "Apólice" |
| 4 | **Padrão da empresa** (`padrao`) | 999 | só o CNPJ da empresa | Mapa → "Padrão da empresa" (só para empresa sem padrão) |
| 5 | **Fallback geral** (`fallback`) | 1000 | qualquer nota que não casou acima | backend (modelo geral, compartilhado) |

Regras `legado` (compat por razão social e a antiga VR0001 em 1–9, inativas desde a migração 0044 do backend)
aparecem só em "Regras de sistema", colapsado, dentro da empresa.

Apólices vencem o padrão da empresa; o padrão vence o fallback geral. A compatibilidade por razão social foi removida.
A tela mostra o **rótulo da camada** e, ao lado, o número interno em cinza pequeno (só informativo: vem de
`faixas.camadas` ou da regra).

- **Mapa de emissão** (`/configuracao/mapa`, aba padrão) — **único lugar de configuração de modelo** (decisão do dono,
  10/11/2026: "o modelo X da CONDOCORP é um modelo; não faz sentido configurar em dois lugares"). No topo, a legenda
  da ordem das camadas e a seção **"Canais — todas as empresas"** (externo/VR, só consulta). Árvore por empresa
  (razão social + CNPJ) com uma linha por condição **na ordem das camadas** (Canal → Apólice → Padrão da empresa), cada
  uma com o modelo ativo, o número da camada em cinza e um ponto de status (verde = ativo, amarelo = só rascunho,
  cinza = sem mapeamento). Empresa **sem padrão próprio** mostra, como última linha informativa, o **Fallback geral**
  (e o atalho "Criar padrão da empresa"). Regras sem empresa que não são canal (ex.: fallback geral, XLSX inativa)
  ficam em **"Regras de sistema"**, colapsado e só para consulta.
- **"+ Nova configuração"** aparece no topo da árvore (escolhe a empresa no wizard), no cabeçalho de TODA empresa (fora
  do colapso; desabilitado só para empresa inativa) e na ficha. Abre o **wizard** no painel da direita
  (`/configuracao/mapa/nova?prestador=<id>&tipo=apolice|tipo_nfe|padrao`), com indicador de progresso e "Voltar":
  1. **Condição**: empresa (pré-selecionada), tipo (Apólice | Canal VR/externo | Padrão da empresa — este só para empresa
     `sem_mapeamento`), valor (apólice enviada em maiúsculas e sem espaços), um aviso curto com a **camada** que a
     condição vai receber (não há campo de prioridade), **modelo base** (só versões ATIVAS sem
     empresa ou da própria empresa e do mesmo provedor; pré-seleciona o modelo do padrão da empresa ou o FALLBACK se for
     compatível; senão exige escolha explícita e explica), código opcional e motivo. "Criar rascunho e avançar" chama
     `POST mapa/criar/` (modelo novo inativo + regra `[mapa]` inativa). Erros ficam no passo (tabela abaixo).
  2. **Parâmetros**: formulário por grupos do rascunho (o mesmo da ficha), campos que diferem do modelo base destacados
     em amarelo, salvar com motivo e dry-run inline.
  3. **Ativar**: resumo (empresa, condição, camada, versão), "Simular impacto" (`regras/simular/` com
     `ativar_modelos=[id]`), "Ativar agora" (mesmas travas e resumo pós-ativação) ou "Deixar como rascunho". Ao terminar,
     abre a ficha da combinação.
- **Ficha** (`/configuracao/mapa/:prestadorId/:condicao`, `GET mapa/{prestador_id}/{condicao}/`): cabeçalho com
  empresa/condição/camada/versão ativa; seletor de versões (ativa e rascunhos) com "Clonar para editar", "Ativar" e
  "Desativar" (travas confirmáveis + resumo da ativação); formulário com **todos os parâmetros do JSON** gerado de
  `schema.grupos` (versão ativa travada, rascunho editável com motivo); regras da versão (só consulta, por camada);
  **"Simular impacto"** do rascunho em foco (`regras/simular/` com `ativar_modelos=[id]`); dry-run; últimas notas;
  payload de exemplo (mascarado pelo servidor); **Histórico** (auditoria filtrada pela versão em foco e pela regra).
- **A aba "Modelos" foi removida.** `/configuracao/modelos` redireciona para o mapa; `/configuracao/modelos/:id` procura
  no `GET mapa/` a combinação cuja regra usa a versão (ou o mesmo código) e abre a ficha com ela em foco; sem combinação
  (ex.: transversais E-2/B-1), vai para `/configuracao/mapa`.
- **Prestadores** e **Auditoria**.
- **A aba "Regras" (grupo "Avançado") foi removida** (10/11/2026): a camada é definida pelo Mapa na criação
  (apólice → camada Apólice; padrão → camada Padrão da empresa; canal da empresa → camada Canal da empresa). `/configuracao/regras`
  redireciona para `/configuracao/mapa`. A simulação continua no wizard (passo 3) e na ficha. Ajuste de regra fora
  desse fluxo (ex.: regra inválida num clone) fica com o time técnico (Django Admin).
- Requer o backend com `GET mapa/`, `POST mapa/criar/`, `GET mapa/{prestador_id}/{condicao}/` e `schema.grupos`
  (§4.8/§9 do contrato). Sem eles a aba Mapa mostra erro/aviso; as demais abas continuam funcionando.
- **Camadas** (contrato §9.1/§9.2, R85): o front lê `camada: {chave, rotulo}` de cada condição de `GET mapa/`,
  `camada` (texto) e `prioridade` das regras (§5, `diff_regras`) e `faixas.camadas` (rótulo + número) para a legenda.
  Os rótulos exibidos são curtos ("Canal da empresa", "Canal", "Apólice", "Padrão da empresa", "Fallback geral"); o
  rótulo completo do backend aparece no tooltip. Com backend antigo (sem `camada`), a camada é deduzida pelo tipo da
  condição — publicar o front junto ou depois do backend com a migração `0044_camadas_fixas`.

### Editar o padrão da empresa (contrato §9.6)

A ficha "Padrão" (`/configuracao/mapa/<id>/padrao`) **sempre** oferece um caminho de edição; qual botão aparece vem de
`acoes_disponiveis` (ficha e `GET mapa/`):

| Situação | O que a tela mostra | O que acontece |
|---|---|---|
| Padrão com modelo **só desta empresa** (`acoes_disponiveis: ["clonar_versao"]`) | "Clonar para editar" | clona a versão ativa como rascunho do mesmo código; editar, dry-run, ativar (fluxo de sempre) |
| Padrão com modelo **compartilhado** (`modelo_compartilhado: true`, `acoes_disponiveis: ["derivar_padrao_proprio"]`; ex.: CONDOCORP no B-1, que também é o fallback geral) | aviso "Hoje esta empresa usa o modelo compartilhado B-1, que também é o fallback geral. Editar cria um modelo só dela; o B-1 continua para as demais." + botão primário **"Criar padrão próprio desta empresa"**; na árvore do Mapa, badge **compartilhado** na linha Padrão | modal com motivo (e código opcional, ex.: B-2) → `POST mapa/{prestador_id}/padrao/derivar/` cria um modelo novo da empresa (rascunho, cópia do compartilhado) → abre o wizard direto no passo **Parâmetros** (campos diferentes do compartilhado destacados) → passo **Ativar** |
| Empresa **sem padrão próprio** (`sem_mapeamento`, cai no fallback; `acoes_disponiveis: ["criar_padrao"]`) | "Criar padrão da empresa" (o fallback fica só para consulta) | wizard com condição Padrão (`POST mapa/criar/`) |
| Já existe padrão derivado **em rascunho** (`padrao_derivado_pendente`) | aviso "Há um padrão próprio desta empresa em rascunho" + "Editar / ativar o rascunho"; o rascunho entra no seletor de versões como "padrão próprio, rascunho" | edita (`PATCH modelos/{id}/`), dry-run e ativa (`POST modelos/{id}/ativar/`) na própria ficha; não deriva de novo |

- O rascunho derivado **não emite** até ser ativado. Ao ativar, a regra padrão da empresa é **reapontada** do
  compartilhado para o modelo novo; o resumo da ativação mostra "Regra padrão reapontada: B-1 → B-2". O compartilhado
  segue valendo para as demais empresas e como fallback geral.
- O derivado não tem regra própria: a regra padrão (999) da empresa só troca de modelo na ativação (por isso não cai em
  `versao_sem_regra_ativa`). "Simular impacto" já considera o reapontamento.
- Rollback: desativar o modelo novo na ficha (`confirmar: true`): a regra 999 fica no modelo inativo e a empresa passa a
  cair no **fallback geral** (no caso CONDOCORP, o mesmo B-1 de antes; o mapa volta a mostrar "sem padrão próprio").
- Erros de `derivar/` (nada gravado): 409 `derivacao_pendente` (o modal oferece "Abrir o rascunho existente"),
  409 `padrao_nao_compartilhado` (usar "Clonar para editar"), 409 `sem_padrao_proprio` (usar "Criar padrão da
  empresa"), 400 em `codigo_sugerido` (deixar vazio ou outro código), 400 em `prestador_id` (empresa inativa), 404.
- Na ficha de modelo compartilhado o botão "Desativar" da versão ativa fica oculto (desativaria o modelo de todas as
  empresas); a ficha de empresa sem padrão mostra o fallback só para consulta.
- **Trava `modelo_compartilhado` (409) no ativar**: a ficha e o wizard enviam `prestador_id` em
  `POST modelos/{id}/ativar/`. Se a versão não tem empresa e o código tem regra de outro dono (fallback, outra empresa,
  canal), o backend recusa com 409 `modelo_compartilhado`: a tela mostra a mensagem, os donos (`campos.donos`) e o caminho
  (`campos.acao`), sem "Confirmar mesmo assim"; quando cabe, oferece "Criar padrão próprio desta empresa". Ativar o
  modelo do fallback (ex.: B-1 v2) só pelo caminho global (sem `prestador_id`), com o time técnico.
- `modelo_eh_fallback` decide se o aviso diz "que também é o fallback geral".
- Wizard com condição Padrão em empresa cujo padrão é compartilhado: 409 `condicao_duplicada` com `campos.acao`
  apontando para `padrao/derivar/` → o passo 1 mostra o botão "Criar padrão próprio desta empresa".
- **Padrão inativo** (rollback feito: `acoes_disponiveis: ["reativar_padrao"]` + `modelo_a_reativar`): a árvore mostra
  o badge "Padrão inativo" e o link "Reativar"; a ficha mostra o aviso e "Reativar padrão (B-2)" →
  `POST modelos/{id}/ativar/` com `prestador_id` (nada é reapontado: a regra 999 já está no B-2). `derivar/` ou
  `mapa/criar` (padrão) nesse estado → 409 `padrao_inativo` (`campos.modelo_id`): o modal/wizard oferece o mesmo botão.
- **Vínculo do derivado** (`campos_fixos._padrao_derivado`, só leitura): o editor mostra "Padrão derivado de B-1
  (regra N)", tira a diretiva do JSON editável (o PATCH a omite e o backend preserva) e trava o campo prestador.
- **Ativar o derivado**: 409 `derivacao_invalida` (não confirmável; motivos em `campos.derivacao`) → descartar o
  rascunho e derivar de novo. 409 `origem_desatualizada` (confirmável) → a tela lista as diferenças campo a campo
  (origem gravada × versão ativa da origem); aplicar no rascunho o que valer e/ou "Ativar mesmo assim"
  (`confirmar: true`). "Simular impacto" com vínculo inválido → 400 em `campos.ativar_modelos`, exibido no painel.
- Backend antigo (sem `acoes_disponiveis`): o front mostra "Clonar para editar" quando há padrão próprio e "Criar padrão
  da empresa" quando não há. Publicar o front junto ou depois do backend com a §9.6.

### Erros de `POST mapa/criar/` (passo 1 do wizard) e o que fazer

Todo erro aparece no passo (alerta com a mensagem do backend, o código HTTP/`codigo` e, em "Outros erros", as chaves de
`erro.campos` sem campo próprio) e também numa notificação.

| HTTP / `codigo` | Quando | O que fazer |
|---|---|---|
| 400 `motivo_obrigatorio` | motivo vazio ou < 5 caracteres | preencher o motivo |
| 400 `validacao` em `prestador_id` | empresa INATIVA | ativar a empresa na aba Prestadores |
| 400 `validacao` em `condicao` | apólice vazia/> 30 caracteres; canal diferente de `vr`/`externo` | corrigir o valor (a mensagem do backend aparece no passo) |
| 400 `validacao` em `base_modelo_id` | base inexistente, restrita a outra empresa ou empresa sem padrão nem FALLBACK | escolher outra base no combo (o combo já filtra as compatíveis) |
| 400 `validacao` em `codigo_sugerido` | código fora do formato `LETRA-NÚMERO` ou já usado | deixar vazio (próximo livre) ou escolher outro |
| 400 `validacao` (outros campos, ex.: `provedor`) | base de outro provedor (`full_clean`) | trocar a base; outros casos = falar com o time técnico |
| 401 / 403 | sessão expirada / usuário fora de `NFSE_CONFIG_ADMINS` | entrar de novo / pedir acesso |
| 404 `nao_encontrado` | empresa inexistente (mapa desatualizado) | recarregar o mapa |
| 409 `condicao_duplicada` | já existe regra (ativa ou não, de qualquer versão) para essa empresa e condição | usar o link "Abrir a ficha existente" e editar o rascunho de lá (ou clonar a versão ativa) |

Decisão do dono (10/11/2026): regra Empresa + Apólice sempre vence a regra só por CNPJ da empresa, para todas as
empresas (camada Apólice antes da camada Padrão da empresa).

Nada é gravado em nenhum desses casos (transação única); sucesso grava auditoria `criar` do modelo e da regra.

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
  Regra inválida na ativação não aceita confirmação: recriar a configuração pelo Mapa ou acionar o time técnico.
  409 `conflito_condicao` (R85; o front aceita também o código antigo `conflito_prioridade`) também não aceita
  confirmação: "já existe uma regra efetiva com as mesmas condições (empresa/apólice); ajuste ou desative a regra
  existente". Após
  ativar, a tela mostra o resumo (versões desativadas, diff de regras por camada e quantas das últimas 200 notas
  mudariam de modelo).
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
- Bundle único de ~960 kB (aviso do Vite); considerar code-splitting depois.
