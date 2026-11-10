// Componentes compartilhados da página Configuração.
import { useEffect, useMemo, useState } from "react";
import { FiX, FiAlertTriangle } from "react-icons/fi";
import { diffObjetos, jsonOrdenado, mensagemErro, valorCurto } from "./utils";

/** Modal simples (overlay + painel). `largo` para conteúdos extensos. */
export function Modal({ titulo, aberto, onFechar, children, rodape, largo = false }) {
  useEffect(() => {
    if (!aberto) return undefined;
    const esc = (e) => e.key === "Escape" && onFechar?.();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto, onFechar]);

  if (!aberto) return null;
  return (
    <div className="cfg-overlay" onMouseDown={(e) => e.target === e.currentTarget && onFechar?.()}>
      <div className={`cfg-modal ${largo ? "cfg-modal-largo" : ""}`} role="dialog" aria-modal="true">
        <div className="cfg-modal-header">
          <h3>{titulo}</h3>
          <button type="button" className="cfg-icon-btn" onClick={onFechar} aria-label="Fechar">
            <FiX size={20} />
          </button>
        </div>
        <div className="cfg-modal-body">{children}</div>
        {rodape && <div className="cfg-modal-footer">{rodape}</div>}
      </div>
    </div>
  );
}

/** Campo de formulário com rótulo, ajuda e erro do backend. */
export function Campo({ label, erro, ajuda, children, obrigatorio = false }) {
  return (
    <div className={`cfg-campo ${erro ? "cfg-campo-erro" : ""}`}>
      {label && (
        <label>
          {label}
          {obrigatorio && <span className="cfg-obrigatorio"> *</span>}
        </label>
      )}
      {children}
      {ajuda && !erro && <small className="cfg-ajuda">{ajuda}</small>}
      {erro && <small className="cfg-erro-msg">{erro}</small>}
    </div>
  );
}

/** Campo "motivo" obrigatório em toda escrita (vai para a auditoria). */
export function CampoMotivo({ valor, onChange, erro, placeholder }) {
  return (
    <Campo label="Motivo da alteração" obrigatorio erro={erro} ajuda="Registrado na auditoria.">
      <textarea
        className="cfg-input"
        rows={2}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Ex.: ajuste solicitado pelo fiscal em 10/11"}
      />
    </Campo>
  );
}

export function Badge({ children, cor = "neutro", title }) {
  return (
    <span className={`cfg-badge cfg-badge-${cor}`} title={title}>
      {children}
    </span>
  );
}

export function Indicador({ ok, textoOk = "configurado", textoNao = "ausente" }) {
  return (
    <span className={`cfg-indicador ${ok ? "ok" : "nao"}`} title={ok ? textoOk : textoNao}>
      <span className="cfg-bolinha" />
      {ok ? textoOk : textoNao}
    </span>
  );
}

/** Estado vazio / carregando / erro. */
export function Estado({ carregando, erro, vazio, textoVazio = "Nada para exibir.", children }) {
  if (carregando) return <div className="cfg-estado">Carregando…</div>;
  if (erro)
    return (
      <div className="cfg-estado cfg-estado-erro">
        <FiAlertTriangle /> {erro}
      </div>
    );
  if (vazio) return <div className="cfg-estado">{textoVazio}</div>;
  return children;
}

/** Bloco JSON somente leitura. */
export function JsonView({ valor, altura }) {
  const texto = useMemo(() => {
    if (valor === undefined) return "—";
    try {
      return jsonOrdenado(valor);
    } catch {
      return String(valor);
    }
  }, [valor]);
  return (
    <pre className="cfg-json" style={altura ? { maxHeight: altura } : undefined}>
      {texto}
    </pre>
  );
}

/**
 * Editor JSON com validação: mantém o texto local e só chama onChange(objeto) quando o JSON é válido
 * e é um objeto. onValidez(bool) avisa o pai para bloquear o salvar.
 */
export function JsonEditor({ valor, onChange, onValidez, desabilitado, linhas = 10 }) {
  const [texto, setTexto] = useState(() => JSON.stringify(valor ?? {}, null, 2));
  const [erro, setErro] = useState("");

  // Ressincroniza quando o valor externo muda (ex.: troca de versão), sem sobrescrever edição inválida.
  const externo = JSON.stringify(valor ?? {});
  useEffect(() => {
    setTexto((atual) => {
      try {
        if (JSON.stringify(JSON.parse(atual)) === externo) return atual;
      } catch {
        /* texto atual inválido: substitui pelo valor externo */
      }
      return JSON.stringify(JSON.parse(externo), null, 2);
    });
    setErro("");
  }, [externo]);

  const alterar = (t) => {
    setTexto(t);
    try {
      const obj = JSON.parse(t || "{}");
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("Deve ser um objeto JSON {…}.");
      setErro("");
      onValidez?.(true);
      onChange?.(obj);
    } catch (e) {
      setErro(e.message || "JSON inválido.");
      onValidez?.(false);
    }
  };

  return (
    <div>
      <textarea
        className={`cfg-input cfg-mono ${erro ? "cfg-input-erro" : ""}`}
        rows={linhas}
        value={texto}
        disabled={desabilitado}
        spellCheck={false}
        onChange={(e) => alterar(e.target.value)}
      />
      {erro && <small className="cfg-erro-msg">JSON inválido: {erro}</small>}
    </div>
  );
}

/**
 * Diff lado a lado. Recebe dois objetos (a = versão ativa, b = rascunho) ou linhas já prontas.
 */
export function DiffLadoALado({ a, b, linhas, rotuloA = "Versão ativa", rotuloB = "Rascunho", soDiferencas: inicial = true }) {
  const [soDiferencas, setSoDiferencas] = useState(inicial);
  const todas = useMemo(() => linhas || diffObjetos(a, b), [a, b, linhas]);
  const exibidas = soDiferencas ? todas.filter((l) => l.tipo !== "igual") : todas;
  const qtdDif = todas.filter((l) => l.tipo !== "igual").length;

  return (
    <div className="cfg-diff">
      <div className="cfg-diff-topo">
        <span>
          {qtdDif === 0 ? "Nenhuma diferença." : `${qtdDif} chave(s) diferente(s).`}
        </span>
        <label className="cfg-check">
          <input type="checkbox" checked={soDiferencas} onChange={(e) => setSoDiferencas(e.target.checked)} />
          Só diferenças
        </label>
      </div>
      <div className="cfg-tabela-wrap">
        <table className="cfg-tabela cfg-tabela-diff">
          <thead>
            <tr>
              <th>Chave</th>
              <th>{rotuloA}</th>
              <th>{rotuloB}</th>
            </tr>
          </thead>
          <tbody>
            {exibidas.map((l) => (
              <tr key={l.chave} className={`cfg-diff-${l.tipo}`}>
                <td className="cfg-mono">{l.chave}</td>
                <td className="cfg-mono">{valorCurto(l.a)}</td>
                <td className="cfg-mono">{valorCurto(l.b)}</td>
              </tr>
            ))}
            {exibidas.length === 0 && (
              <tr>
                <td colSpan={3} className="cfg-centro">
                  Sem diferenças.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Lista de detalhes [[chave, mensagem]] vinda de erro.campos (ex.: regras inválidas, campos fiscais afetados). */
export function ListaDetalhes({ itens }) {
  if (!itens?.length) return null;
  return (
    <ul className="cfg-lista-detalhes">
      {itens.map(([chave, msg]) => (
        <li key={chave}>
          <strong className="cfg-mono">{chave}</strong>: {msg}
        </li>
      ))}
    </ul>
  );
}

/**
 * Alerta com TODA a informação do erro do backend ({erro:{codigo, mensagem, campos}}): mensagem principal e,
 * em "Outros erros", as chaves de `campos` que não têm campo próprio na tela (`conhecidos`).
 * Erro sem corpo do contrato (rede, 5xx com HTML) mostra a mensagem genérica de `mensagemErro`.
 */
export function ErrosBackend({ erro, conhecidos = [], padrao = "Falha na operação.", children }) {
  if (!erro) return null;
  const corpo = erro?.response?.data?.erro;
  const status = erro?.response?.status;
  const mensagem = corpo?.mensagem || mensagemErro(erro, padrao);
  const conhecidosSet = new Set(conhecidos);
  const outros = corpo?.campos && typeof corpo.campos === "object"
    ? Object.entries(corpo.campos).filter(([k]) => !conhecidosSet.has(k))
    : [];
  return (
    <div className="cfg-aviso cfg-aviso-perigo" role="alert">
      <FiAlertTriangle />
      <div>
        <strong>{mensagem}</strong>
        {(corpo?.codigo || status) && (
          <small className="cfg-ajuda cfg-mono"> ({[status, corpo?.codigo].filter(Boolean).join(" · ")})</small>
        )}
        {outros.length > 0 && (
          <>
            <div style={{ marginTop: 4 }}>Outros erros:</div>
            <ul className="cfg-lista-detalhes">
              {outros.map(([k, v]) => (
                <li key={k}>
                  <span className="cfg-mono">{k === "__all__" || k === "non_field_errors" ? "geral" : k}</span>:{" "}
                  {Array.isArray(v) ? v.map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join(" ") : typeof v === "string" ? v : JSON.stringify(v)}
                </li>
              ))}
            </ul>
          </>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * Rótulo da camada da regra ("Apólice", "Padrão da empresa", "Canal", "Fallback geral") com o número da prioridade em
 * cinza pequeno, só informativo (decisão do dono, 10/11/2026: prioridade não é mais editável nem exposta como conceito).
 * props: camada = {rotulo, prioridade} (ver mapaDados.camadaDe); semNumero oculta o número.
 */
export function RotuloCamada({ camada, semNumero = false, prefixo = "" }) {
  if (!camada) return null;
  return (
    <span
      className="cfg-camada"
      title={`Camada ${camada.rotuloBackend || camada.rotulo}${camada.prioridade != null ? ` (prioridade interna ${camada.prioridade}, só informativa)` : ""}`}
    >
      {prefixo}
      {camada.rotulo}
      {!semNumero && camada.prioridade != null && <small className="cfg-camada-num">{camada.prioridade}</small>}
    </span>
  );
}
