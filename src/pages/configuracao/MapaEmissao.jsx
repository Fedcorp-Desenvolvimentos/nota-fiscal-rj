// Aba "Mapa de emissão": qual modelo cada empresa usa (padrão e por apólice/canal).
// Esquerda: árvore por empresa (GET mapa/); direita: ficha da combinação (rota mapa/:prestadorId/:condicao).
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Outlet, useMatch, useNavigate } from "react-router-dom";
import { FiChevronDown, FiChevronRight, FiPlus, FiRefreshCw, FiSearch, FiAlertTriangle } from "react-icons/fi";
import { configService } from "../../services/config";
import { Badge, Estado } from "./componentes";
import NovaConfiguracaoModal from "./NovaConfiguracaoModal";
import { STATUS_COMBINACAO, corCondicao, normalizarMapa, rotuloVersao } from "./mapaDados";
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
  const conteudo = (
    <>
      <PontoStatus status={comb.status} />
      {comb.tipo === "padrao" ? <span className="cfg-mapa-padrao">Padrão</span> : <Badge cor={corCondicao(comb.tipo)}>{comb.rotulo}</Badge>}
      <span className="cfg-mapa-versao cfg-mono" title={comb.regra ? `regra prioridade ${comb.regra.prioridade}` : undefined}>
        {textoVersao(comb)}
      </span>
    </>
  );
  if (!empresa || !TIPOS_COM_FICHA.has(comb.tipo)) {
    // Compat por razão social / outras condições / transversais: só leitura, editar pela aba Regras (Avançado).
    return (
      <Link
        to={comb.modelo?.id != null ? `/configuracao/regras?modelo=${comb.modelo.id}` : "/configuracao/regras"}
        className="cfg-mapa-linha cfg-mapa-linha-ro"
        title="Sem ficha no mapa: abrir na aba Regras (Avançado)"
      >
        {conteudo}
      </Link>
    );
  }
  const destino = `/configuracao/mapa/${empresa.id}/${encodeURIComponent(comb.chave)}`;
  return (
    <Link to={destino} className={`cfg-mapa-linha ${selecionada ? "selecionada" : ""}`}>
      {conteudo}
    </Link>
  );
}

function NoEmpresa({ empresa, aberta, onAlternar, selecao, onNova }) {
  const temPadraoProprio = empresa.padrao && !empresa.semMapeamento;
  return (
    <div className={`cfg-mapa-empresa ${empresa.ativo ? "" : "cfg-inativa"}`}>
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
      {aberta && (
        <div className="cfg-mapa-filhos">
          {empresa.padrao && (
            <LinhaCombinacao
              empresa={empresa}
              comb={empresa.padrao}
              selecionada={selecao.prestadorId === String(empresa.id) && selecao.condicao === empresa.padrao.chave}
            />
          )}
          {!temPadraoProprio && (
            <div className="cfg-mapa-vazio">
              <FiAlertTriangle /> Sem padrão próprio: cai no modelo padrão geral (fallback).
              <button type="button" className="cfg-link-btn" onClick={() => onNova(empresa, "padrao")}>
                Criar padrão da empresa
              </button>
            </div>
          )}
          {empresa.condicoes.map((c) => (
            <LinhaCombinacao
              key={c.chave}
              empresa={empresa}
              comb={c}
              selecionada={selecao.prestadorId === String(empresa.id) && selecao.condicao === c.chave}
            />
          ))}
          <button type="button" className="cfg-btn cfg-btn-contorno cfg-btn-sm cfg-mapa-nova" onClick={() => onNova(empresa, "apolice")}>
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
  const [transversais, setTransversais] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [abertas, setAbertas] = useState(() => new Set());
  const [novo, setNovo] = useState(null); // {empresa, tipo}

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    setErro("");
    try {
      const d = await configService.listarMapa();
      const m = normalizarMapa(d);
      setEmpresas(m.empresas);
      setTransversais(m.transversais);
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
        <Estado carregando={carregando} erro={erro} vazio={filtradas.length === 0} textoVazio="Nenhuma empresa encontrada.">
          {filtradas.map((e) => (
            <NoEmpresa
              key={e.id}
              empresa={e}
              aberta={abertas.has(String(e.id)) || !!busca.trim()}
              onAlternar={() => alternar(e.id)}
              selecao={selecao}
              onNova={(empresa, tipo) => setNovo({ empresa, tipo })}
            />
          ))}
          {transversais.length > 0 && !busca.trim() && (
            <div className="cfg-mapa-transversais">
              <div className="cfg-mapa-transversais-titulo" title="Regras sem empresa: valem para todas (externo, VR, XLSX, fallback)">
                Regras para todas as empresas
              </div>
              {transversais.map((c) => (
                <LinhaCombinacao key={c.chave} empresa={null} comb={c} selecionada={false} />
              ))}
            </div>
          )}
        </Estado>
      </aside>

      <section className="cfg-mapa-ficha">
        {selecao.prestadorId ? (
          <Outlet
            context={{
              empresa: empresaSelecionada,
              recarregarMapa: () => carregar(true),
              abrirNova: (empresa, tipo) => setNovo({ empresa, tipo }),
            }}
          />
        ) : (
          <div className="cfg-card cfg-estado">
            Escolha uma empresa e uma configuração à esquerda (Padrão ou uma condição) para ver e editar todos os parâmetros do
            JSON enviado à Focus.
          </div>
        )}
      </section>

      <NovaConfiguracaoModal
        aberto={!!novo}
        empresa={novo?.empresa}
        tipoInicial={novo?.tipo}
        onFechar={() => setNovo(null)}
        onCriado={(resp, chave) => {
          const pid = novo.empresa.id;
          setNovo(null);
          carregar(true);
          navigate(`/configuracao/mapa/${pid}/${encodeURIComponent(chave)}`, {
            state: { rascunhoId: resp?.objeto?.modelo?.id ?? null, proximosPassos: resp?.objeto?.proximos_passos ?? null },
          });
        }}
      />
    </div>
  );
}
