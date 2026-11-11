// Aba "Mapa de emissão": qual modelo cada empresa usa (padrão e por apólice/canal).
// Esquerda: árvore por empresa (GET mapa/); direita: ficha da combinação (rota mapa/:prestadorId/:condicao) ou o wizard
// "Nova configuração" (rota mapa/nova?prestador=&tipo=). É o único lugar de configuração de modelo (a antiga aba
// "Modelos" foi unificada aqui em 10/11/2026; a aba "Regras" saiu no mesmo dia).
// Camadas fixas (decisão do dono, 10/11/2026): Canal → Apólice → Padrão da empresa → Fallback geral. As condições de
// cada empresa aparecem nessa ordem, com o número da prioridade em cinza (só informativo); o fallback geral aparece
// como última linha só nas empresas sem padrão próprio. Canais transversais (camada `canais`: externo/VR/XLSX inativa)
// ficam no topo; o que sobrar em `transversais` (FALLBACK) vai para "Regras de sistema", colapsado. Condições `legado`
// da empresa (compat razão social, VR0001 1–9, inativas desde a 0044) também ficam colapsadas em "Regras de sistema".
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useMatch, useNavigate, useOutlet } from "react-router-dom";
import { FiChevronDown, FiChevronRight, FiPlus, FiRefreshCw, FiSearch, FiAlertTriangle } from "react-icons/fi";
import { configService } from "../../services/config";
import { Badge, Estado, RotuloCamada } from "./componentes";
import { CAMADAS, STATUS_COMBINACAO, camadasDaLegenda, corCondicao, normalizarMapa, padraoInativo, podeCriarPadrao, rotuloVersao } from "./mapaDados";
import { formatarCnpj, mensagemErro } from "./utils";

function PontoStatus({ status }) {
  const s = STATUS_COMBINACAO[status] || STATUS_COMBINACAO.sem;
  return <span className={`cfg-ponto cfg-ponto-${s.classe}`} title={s.texto} aria-label={s.texto} />;
}

// Tipos com ficha própria (§9: a URL aceita padrao, apolice, tipo_nfe e prefixo).
const TIPOS_COM_FICHA = new Set(["padrao", "apolice", "tipo_nfe", "prefixo"]);

function textoVersao(comb) {
  if (comb.semMapeamento) return comb.modelo ? `fallback ${rotuloVersao(comb.modelo)}` : "fallback";
  if (comb.modeloAtivo) return rotuloVersao(comb.modeloAtivo);
  if (comb.rascunhos.length) return `rascunho ${rotuloVersao(comb.rascunhos[0])}`;
  if (comb.modelo) return `${rotuloVersao(comb.modelo)} (inativo)`;
  return "—";
}

function LinhaCombinacao({ empresa, comb, selecionada }) {
  const camada = comb.camada;
  const conteudo = (
    <>
      <PontoStatus status={comb.status} />
      {comb.tipo === "padrao" ? (
        <>
          <span className="cfg-mapa-padrao">{camada?.chave === "fallback" ? CAMADAS.fallback.rotulo : CAMADAS.padrao.rotulo}</span>
          {padraoInativo(comb) && (
            <Badge cor="vermelho" title="O padrão próprio desta empresa está desativado: as notas caem no fallback geral">
              Padrão inativo
            </Badge>
          )}
          {comb.modeloCompartilhado && (
            <Badge cor="amarelo" title="Modelo compartilhado com outras empresas (ex.: fallback geral): editar cria um padrão próprio desta empresa">
              compartilhado
            </Badge>
          )}
        </>
      ) : (
        <Badge cor={corCondicao(comb.tipo)}>{comb.rotulo}</Badge>
      )}
      <span className="cfg-mapa-versao cfg-mono" title={camada ? `Camada ${camada.rotulo}` : undefined}>
        {textoVersao(comb)}
        {camada?.prioridade != null && <small className="cfg-camada-num"> {camada.prioridade}</small>}
      </span>
    </>
  );
  if (!empresa || !TIPOS_COM_FICHA.has(comb.tipo)) {
    // Canais transversais e regras de sistema: só leitura (não têm ficha por empresa; a aba Regras foi removida).
    return (
      <div className="cfg-mapa-linha cfg-mapa-linha-ro" title={`Camada ${camada?.rotulo || "?"} · sem ficha no mapa (só consulta)`}>
        {conteudo}
      </div>
    );
  }
  const destino = `/configuracao/mapa/${empresa.id}/${encodeURIComponent(comb.chave)}`;
  return (
    <Link to={destino} className={`cfg-mapa-linha ${selecionada ? "selecionada" : ""}`}>
      {conteudo}
    </Link>
  );
}

/** Última linha informativa das empresas sem padrão próprio: as notas sem canal/apólice caem no fallback geral. */
function LinhaFallback({ fallback }) {
  return (
    <div className="cfg-mapa-linha cfg-mapa-linha-info" title="Informativo: o fallback geral vale para todas as empresas sem padrão próprio">
      <PontoStatus status="sem" />
      <span>{CAMADAS.fallback.rotulo}</span>
      <span className="cfg-mapa-versao cfg-mono">
        {fallback?.modeloAtivo || fallback?.modelo ? rotuloVersao(fallback.modeloAtivo || fallback.modelo) : "—"}
        {fallback?.camada?.prioridade != null && <small className="cfg-camada-num"> {fallback.camada.prioridade}</small>}
      </span>
    </div>
  );
}

function NoEmpresa({ empresa, aberta, onAlternar, selecao, onNova, fallback }) {
  // §9.6: `criar_padrao` em acoes_disponiveis = sem padrão próprio (backend antigo: sem_mapeamento).
  const criarPadrao = podeCriarPadrao(empresa.padrao, empresa.semMapeamento);
  const temPadraoProprio = empresa.padrao && !criarPadrao;
  return (
    <div className={`cfg-mapa-empresa ${empresa.ativo ? "" : "cfg-inativa"}`}>
      <div className="cfg-mapa-empresa-linha">
        <button type="button" className="cfg-mapa-empresa-cab" onClick={onAlternar} aria-expanded={aberta}>
          {aberta ? <FiChevronDown /> : <FiChevronRight />}
          <span className="cfg-mapa-empresa-nome">
            <strong>{empresa.razao_social}</strong>
            <small className="cfg-mono">{formatarCnpj(empresa.cnpj)}</small>
          </span>
          {!empresa.ativo && <Badge>inativa</Badge>}
          {empresa.semMapeamento && <Badge cor="amarelo">fallback</Badge>}
          {!aberta && empresa.condicoes.length > 0 && <small className="cfg-ajuda">+{empresa.condicoes.length}</small>}
        </button>
        {/* Fora do colapso: visível para TODA empresa (padrão por CNPJ 450–470, sem mapeamento etc.). */}
        <button
          type="button"
          className="cfg-icon-btn cfg-mapa-empresa-nova"
          onClick={() => onNova(empresa, criarPadrao ? "padrao" : "apolice")}
          disabled={!empresa.ativo}
          title={empresa.ativo ? `Nova configuração — ${empresa.razao_social}` : "Empresa inativa: ative-a em Prestadores antes de mapear"}
          aria-label={`Nova configuração — ${empresa.razao_social}`}
        >
          <FiPlus />
        </button>
      </div>
      {aberta && (
        <div className="cfg-mapa-filhos">
          {/* Ordem das camadas: Canal → Apólice → Padrão da empresa (→ Fallback geral, só sem padrão próprio). */}
          {empresa.condicoes.map((c) => (
            <LinhaCombinacao
              key={c.chave}
              empresa={empresa}
              comb={c}
              selecionada={selecao.prestadorId === String(empresa.id) && selecao.condicao === c.chave}
            />
          ))}
          {temPadraoProprio ? (
            <>
              <LinhaCombinacao
                empresa={empresa}
                comb={empresa.padrao}
                selecionada={selecao.prestadorId === String(empresa.id) && selecao.condicao === empresa.padrao.chave}
              />
              {padraoInativo(empresa.padrao) && (
                <div className="cfg-mapa-vazio">
                  <FiAlertTriangle /> Padrão próprio
                  {empresa.padrao.modeloAReativar ? ` (${rotuloVersao(empresa.padrao.modeloAReativar)})` : ""} desativado: as notas caem
                  no fallback geral.
                  <Link
                    className="cfg-link-btn"
                    to={`/configuracao/mapa/${empresa.id}/${encodeURIComponent(empresa.padrao.chave)}`}
                    state={{ reativar: true }}
                  >
                    Reativar
                  </Link>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="cfg-mapa-vazio">
                <FiAlertTriangle /> Sem padrão próprio: as notas sem canal/apólice caem no fallback geral.
                <button type="button" className="cfg-link-btn" onClick={() => onNova(empresa, "padrao")}>
                  Criar padrão da empresa
                </button>
              </div>
              {empresa.padrao ? (
                <Link
                  to={`/configuracao/mapa/${empresa.id}/${encodeURIComponent(empresa.padrao.chave)}`}
                  className={`cfg-mapa-linha cfg-mapa-linha-info ${
                    selecao.prestadorId === String(empresa.id) && selecao.condicao === empresa.padrao.chave ? "selecionada" : ""
                  }`}
                  title="Informativo: o fallback geral vale para todas as empresas sem padrão próprio (abre só para consulta)"
                >
                  <PontoStatus status="sem" />
                  <span>{CAMADAS.fallback.rotulo}</span>
                  <span className="cfg-mapa-versao cfg-mono">
                    {textoVersao(empresa.padrao)}
                    {empresa.padrao.camada?.prioridade != null && <small className="cfg-camada-num"> {empresa.padrao.camada.prioridade}</small>}
                  </span>
                </Link>
              ) : (
                <LinhaFallback fallback={fallback} />
              )}
            </>
          )}
          {empresa.sistema?.length > 0 && (
            <details className="cfg-mapa-sistema">
              <summary className="cfg-ajuda" title="Regras legadas/inativas desta empresa (compat por razão social removida): só consulta">
                Regras de sistema ({empresa.sistema.length})
              </summary>
              {empresa.sistema.map((c) => (
                <LinhaCombinacao key={c.chave} empresa={null} comb={c} selecionada={false} />
              ))}
            </details>
          )}
          <button
            type="button"
            className="cfg-btn cfg-btn-contorno cfg-btn-sm cfg-mapa-nova"
            onClick={() => onNova(empresa, "apolice")}
            disabled={!empresa.ativo}
            title={empresa.ativo ? "" : "Empresa inativa: ative-a em Prestadores antes de mapear"}
          >
            <FiPlus /> Nova configuração
          </button>
        </div>
      )}
    </div>
  );
}

export default function MapaEmissao() {
  const navigate = useNavigate();
  // useMatch (e não useParams) porque os parâmetros são da rota filha.
  const params = useMatch("/configuracao/mapa/:prestadorId/:condicao")?.params || {};
  // O react-router já entrega os parâmetros decodificados.
  const selecao = useMemo(
    () => ({ prestadorId: params.prestadorId, condicao: params.condicao }),
    [params.prestadorId, params.condicao]
  );

  const [empresas, setEmpresas] = useState([]);
  const [canais, setCanais] = useState([]);
  const [sistema, setSistema] = useState([]);
  const [fallback, setFallback] = useState(null);
  const [camadas, setCamadas] = useState(() => camadasDaLegenda(null));
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [abertas, setAbertas] = useState(() => new Set());
  const rotaNova = useMatch("/configuracao/mapa/nova");

  // "+ Nova configuração": abre o wizard no painel da direita (empresa pré-selecionada quando houver).
  const abrirNova = useCallback(
    (empresa, tipo = "apolice") => {
      const q = new URLSearchParams();
      if (empresa?.id != null) q.set("prestador", String(empresa.id));
      if (tipo) q.set("tipo", tipo);
      navigate(`/configuracao/mapa/nova?${q.toString()}`);
    },
    [navigate]
  );

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    setErro("");
    try {
      const d = await configService.listarMapa();
      const m = normalizarMapa(d);
      setEmpresas(m.empresas);
      setCanais(m.canais);
      setSistema(m.sistema);
      setFallback(m.fallback);
      setCamadas(m.camadas);
    } catch (e) {
      setErro(mensagemErro(e, "Falha ao carregar o mapa de emissão."));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // A empresa da ficha aberta fica sempre expandida.
  useEffect(() => {
    if (selecao.prestadorId) setAbertas((s) => (s.has(selecao.prestadorId) ? s : new Set(s).add(selecao.prestadorId)));
  }, [selecao.prestadorId]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return empresas;
    const digitos = t.replace(/\D/g, "");
    return empresas.filter(
      (e) =>
        e.razao_social.toLowerCase().includes(t) ||
        (digitos && String(e.cnpj).replace(/\D/g, "").includes(digitos)) ||
        e.condicoes.some((c) => String(c.valor ?? "").toLowerCase().includes(t) || c.rotulo.toLowerCase().includes(t))
    );
  }, [empresas, busca]);

  const alternar = (id) =>
    setAbertas((s) => {
      const n = new Set(s);
      const k = String(id);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const empresaSelecionada = empresas.find((e) => String(e.id) === selecao.prestadorId) || null;
  // Rota filha: ficha (mapa/:prestadorId/:condicao) ou wizard (mapa/nova), com o contexto do mapa.
  const outlet = useOutlet({ empresa: empresaSelecionada, empresas, recarregarMapa: () => carregar(true), abrirNova });

  return (
    <div className="cfg-mapa">
      <aside className="cfg-mapa-arvore">
        <div className="cfg-mapa-topo">
          <div className="cfg-mapa-busca">
            <FiSearch />
            <input className="cfg-input" placeholder="Empresa, CNPJ ou apólice" value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <button type="button" className="cfg-icon-btn" onClick={() => carregar()} title="Recarregar" aria-label="Recarregar">
            <FiRefreshCw />
          </button>
        </div>
        <button
          type="button"
          className={`cfg-btn cfg-btn-primario cfg-btn-sm cfg-mapa-nova-global ${rotaNova ? "ativo" : ""}`}
          onClick={() => abrirNova(empresaSelecionada, "apolice")}
          title="Abre o wizard; a empresa é escolhida no primeiro passo"
        >
          <FiPlus /> Nova configuração
        </button>
        <div className="cfg-mapa-legenda">
          <span>
            <PontoStatus status="ativo" /> ativo
          </span>
          <span>
            <PontoStatus status="rascunho" /> só rascunho
          </span>
          <span>
            <PontoStatus status="sem" /> sem mapeamento
          </span>
        </div>
        <div className="cfg-mapa-ordem" title="Ordem fixa de avaliação: a primeira camada que casar define o modelo">
          Ordem:{" "}
          {camadas.map((c, i) => (
            <span key={`${c.chave}-${i}`}>
              {i > 0 && "→ "}
              <RotuloCamada camada={c} />
            </span>
          ))}
        </div>
        <Estado carregando={carregando} erro={erro} vazio={filtradas.length === 0} textoVazio="Nenhuma empresa encontrada.">
          {canais.length > 0 && !busca.trim() && (
            <div className="cfg-mapa-transversais cfg-mapa-canais">
              <div className="cfg-mapa-transversais-titulo" title="Canais de entrada (externo, VR): primeira camada, valem para todas as empresas">
                Canais — todas as empresas
              </div>
              {canais.map((c) => (
                <LinhaCombinacao key={c.chave} empresa={null} comb={c} selecionada={false} />
              ))}
            </div>
          )}
          {filtradas.map((e) => (
            <NoEmpresa
              key={e.id}
              empresa={e}
              aberta={abertas.has(String(e.id)) || !!busca.trim()}
              onAlternar={() => alternar(e.id)}
              selecao={selecao}
              onNova={abrirNova}
              fallback={fallback}
            />
          ))}
          {sistema.length > 0 && !busca.trim() && (
            <details className="cfg-mapa-transversais cfg-mapa-sistema">
              <summary className="cfg-mapa-transversais-titulo" title="Regras sem empresa que não são canal (fallback geral, regras inativas de sistema): só consulta">
                Regras de sistema ({sistema.length})
              </summary>
              {sistema.map((c) => (
                <LinhaCombinacao key={c.chave} empresa={null} comb={c} selecionada={false} />
              ))}
            </details>
          )}
        </Estado>
      </aside>

      <section className="cfg-mapa-ficha">
        {outlet || (
          <div className="cfg-card cfg-estado">
            Escolha uma empresa e uma configuração à esquerda (Padrão ou uma condição) para ver e editar todos os parâmetros do
            JSON enviado à Focus.
          </div>
        )}
      </section>
    </div>
  );
}
