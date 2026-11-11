// Testar: dry-run de uma versão (POST modelos/{id}/dry-run/) com uma nota real ou fixture. Não envia nem grava.
import { useState } from "react";
import { FiPlay, FiX } from "react-icons/fi";
import { configService, FIXTURES_PADRAO } from "../../services/config";
import { DiffLadoALado, JsonView } from "./componentes";
import { mensagemErro, normalizarDiffBackend } from "./utils";

/** props: modelo ({id}), exemplo (payload de exemplo da ficha, opcional), onFechar. */
export default function TestarPainel({ modelo, exemplo, onFechar }) {
  const [entrada, setEntrada] = useState("");
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState("");

  const rodar = async () => {
    const v = entrada.trim();
    if (!v) {
      setErro("Informe a nota (id_integracao) ou uma fixture.");
      return;
    }
    setRodando(true);
    setErro("");
    setResultado(null);
    try {
      const corpo = FIXTURES_PADRAO.includes(v) ? { fixture: v } : { id_integracao: v };
      setResultado(await configService.dryRunModelo(modelo.id, corpo));
    } catch (e) {
      setErro(mensagemErro(e, "Falha no teste."));
    } finally {
      setRodando(false);
    }
  };

  const diff = resultado ? normalizarDiffBackend(resultado.diff_contra_ativa) : null;
  const res = resultado?.resultado;

  return (
    <div className="cfg-card cfg-testar">
      <div className="cfg-card-titulo">
        <h3>Testar</h3>
        <button type="button" className="cfg-icon-btn" onClick={onFechar} aria-label="Fechar">
          <FiX />
        </button>
      </div>
      <div className="cfg-linha-form">
        <input
          className="cfg-input cfg-mono"
          list="cfg-fixtures"
          placeholder="NFSE_… ou fixture"
          value={entrada}
          onChange={(e) => setEntrada(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && rodar()}
        />
        <datalist id="cfg-fixtures">
          {FIXTURES_PADRAO.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        <button type="button" className="cfg-btn cfg-btn-primario" onClick={rodar} disabled={rodando}>
          <FiPlay /> {rodando ? "Montando…" : "Rodar"}
        </button>
      </div>
      {erro && <div className="cfg-aviso cfg-aviso-perigo">{erro}</div>}

      {resultado && (
        <>
          {res && (
            <small className="cfg-meta">
              {[res.builder, res.endpoint, res.prestador?.razao_social].filter(Boolean).join(" · ")}
            </small>
          )}
          {resultado.erro_versao_ativa && (
            <div className="cfg-aviso cfg-aviso-alerta">Publicado não montou: {String(resultado.erro_versao_ativa)}</div>
          )}
          {diff && diff.length > 0 && (
            <details className="cfg-detalhe" open>
              <summary>Diferenças contra o publicado</summary>
              <DiffLadoALado linhas={diff} rotuloA="Publicado" rotuloB="Este" />
            </details>
          )}
          <details className="cfg-detalhe" open={!diff?.length}>
            <summary>Payload</summary>
            <JsonView valor={resultado.payload} altura={360} />
          </details>
        </>
      )}

      {!resultado && exemplo && (exemplo.payload || exemplo.erro) && (
        <details className="cfg-detalhe">
          <summary>Payload de exemplo</summary>
          {exemplo.erro ? <div className="cfg-aviso cfg-aviso-alerta">{String(exemplo.erro)}</div> : <JsonView valor={exemplo.payload} altura={360} />}
        </details>
      )}
    </div>
  );
}
