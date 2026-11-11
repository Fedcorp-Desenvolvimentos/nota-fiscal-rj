// Componentes compartilhados da página Configuração.
import { useEffect, useMemo, useState } from "react";
import { FiX, FiAlertTriangle, FiInfo } from "react-icons/fi";
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
export function Campo({ label, erro, ajuda, info, children, obrigatorio = false }) {
  return (
    <div className={`cfg-campo ${erro ? "cfg-campo-erro" : ""}`}>
      {label && (
        <label>
          {label}
          {obrigatorio && <span className="cfg-obrigatorio"> *</span>}
          <Info texto={info} />
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
    <Campo label="Motivo" obrigatorio erro={erro}>
      <textarea
        className="cfg-input"
        rows={2}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Ex.: pedido do fiscal"}
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
          {qtdDif === 0 ? "Sem diferenças." : `${qtdDif} diferença(s)`}
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

/** Erro do backend em uma linha (mensagem + primeiro campo inválido). */
export function ErrosBackend({ erro, padrao = "Falha na operação." }) {
  if (!erro) return null;
  return (
    <div className="cfg-aviso cfg-aviso-perigo" role="alert">
      <FiAlertTriangle /> <span>{mensagemErro(erro, padrao)}</span>
    </div>
  );
}

/** Ícone (i) com tooltip nativo: ajuda e chave do JSON ficam aqui, nunca como texto corrido. */
export function Info({ texto }) {
  if (!texto) return null;
  return (
    <span className="cfg-info" title={texto} aria-label={texto} tabIndex={0}>
      <FiInfo size={12} />
    </span>
  );
}

/** Painel lateral (histórico). */
export function Drawer({ titulo, aberto, onFechar, children }) {
  useEffect(() => {
    if (!aberto) return undefined;
    const esc = (e) => e.key === "Escape" && onFechar?.();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto, onFechar]);
  if (!aberto) return null;
  return (
    <div className="cfg-overlay cfg-overlay-drawer" onMouseDown={(e) => e.target === e.currentTarget && onFechar?.()}>
      <aside className="cfg-drawer" role="dialog" aria-modal="true">
        <div className="cfg-modal-header">
          <h3>{titulo}</h3>
          <button type="button" className="cfg-icon-btn" onClick={onFechar} aria-label="Fechar">
            <FiX size={18} />
          </button>
        </div>
        <div className="cfg-drawer-corpo">{children}</div>
      </aside>
    </div>
  );
}

/**
 * Modal curto só com motivo (criar padrão, descartar, desativar/reativar apólice).
 * `confirmaveis`: códigos 409 que mostram a mensagem do backend e "<botao> mesmo assim" (repete com confirmar=true).
 * onConfirmar(motivo, confirmar).
 */
export function MotivoModal({ aberto, titulo, botao = "Confirmar", perigo = false, confirmaveis, onFechar, onConfirmar }) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  useEffect(() => {
    setMotivo("");
    setErro("");
    setConfirmacao("");
  }, [aberto]);
  const confirmar = async (forcar = false) => {
    const m = motivo.trim();
    if (m.length < 5) {
      setErro("Mínimo 5 caracteres.");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      await onConfirmar(m, forcar);
    } catch (e) {
      const corpo = e?.response?.data?.erro;
      if (!forcar && confirmaveis?.includes(corpo?.codigo)) setConfirmacao(corpo?.mensagem || "Confirma?");
      else setErro(mensagemErro(e, "Falha na operação."));
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Modal
      aberto={aberto}
      titulo={titulo}
      onFechar={() => !enviando && onFechar?.()}
      rodape={
        <>
          <button type="button" className="cfg-btn cfg-btn-neutro" onClick={onFechar} disabled={enviando}>
            Cancelar
          </button>
          <button
            type="button"
            className={`cfg-btn ${perigo ? "cfg-btn-perigo" : "cfg-btn-primario"}`}
            onClick={() => confirmar(!!confirmacao)}
            disabled={enviando}
          >
            {enviando ? "…" : confirmacao ? `${botao} mesmo assim` : botao}
          </button>
        </>
      }
    >
      <CampoMotivo
        valor={motivo}
        onChange={(v) => {
          setMotivo(v);
          setConfirmacao("");
        }}
        erro={erro.length < 40 ? erro : ""}
      />
      {confirmacao && <div className="cfg-aviso cfg-aviso-alerta">{confirmacao}</div>}
      {erro.length >= 40 && <div className="cfg-aviso cfg-aviso-perigo">{erro}</div>}
    </Modal>
  );
}

/** Ponto de estado do mapa: verde publicado, laranja rascunho, cinza desligado. */
export function Ponto({ estado }) {
  const texto = estado === "rascunho" ? "Rascunho" : estado === "publicado" ? "Publicado" : "Desligado";
  return <span className={`cfg-ponto cfg-ponto-${estado}`} title={texto} aria-label={texto} />;
}
