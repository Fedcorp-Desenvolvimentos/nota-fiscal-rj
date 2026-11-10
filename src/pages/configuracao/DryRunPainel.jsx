// Painel de dry-run de uma versão de modelo (POST modelos/{id}/dry-run/): não envia à Focus, não grava.
// Mostra o payload desta versão, o diff contra a versão ativa (calculado pelo backend) e os dois payloads lado a lado.
import { useState } from "react";
import { FiPlay } from "react-icons/fi";
import { configService, FIXTURES_PADRAO } from "../../services/config";
import { Badge, Campo, DiffLadoALado, JsonView } from "./componentes";
import { codigoErro, mensagemErro, normalizarDiffBackend } from "./utils";

const rotuloVersao = (v) => (v ? `${v.codigo} v${v.versao}${v.ativo === false ? " (inativa)" : ""}` : "—");

export default function DryRunPainel({ modelo, fixtures }) {
  const listaFixtures = Array.isArray(fixtures) && fixtures.length ? fixtures : FIXTURES_PADRAO;
  const [modo, setModo] = useState("fixture");
  const [idIntegracao, setIdIntegracao] = useState("");
  const [fixture, setFixture] = useState(listaFixtures[0] || "");
  const [rodando, setRodando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [payloadAtiva, setPayloadAtiva] = useState(null);
  const [erro, setErro] = useState("");

  const rodar = async () => {
    const entrada = modo === "fixture" ? { fixture: fixture.trim() } : { id_integracao: idIntegracao.trim() };
    if (!Object.values(entrada)[0]) {
      setErro(modo === "fixture" ? "Escolha uma fixture." : "Informe o id_integracao da nota.");
      return;
    }
    setRodando(true);
    setErro("");
    setResultado(null);
    setPayloadAtiva(null);
    try {
      const r = await configService.dryRunModelo(modelo.id, entrada);
      setResultado(r);
      // Para o lado a lado completo, monta também o payload da versão ativa (também é só dry-run).
      const idAtiva = r?.versao_ativa?.id;
      if (idAtiva && String(idAtiva) !== String(modelo.id)) {
        configService
          .dryRunModelo(idAtiva, entrada)
          .then((ra) => setPayloadAtiva(ra?.payload ?? null))
          .catch(() => setPayloadAtiva(undefined));
      }
    } catch (e) {
      const prefixo = codigoErro(e) === "pipeline" ? "O modelo não monta o payload: " : "";
      setErro(prefixo + mensagemErro(e, "Falha no dry-run."));
    } finally {
      setRodando(false);
    }
  };

  const linhasDiff = resultado ? normalizarDiffBackend(resultado.diff_contra_ativa) : null;
  const linhasSnapshot = resultado?.diff_snapshot ? normalizarDiffBackend(resultado.diff_snapshot) : null;
  const res = resultado?.resultado;

  return (
    <div>
      <div className="cfg-filtros">
        <Campo label="Entrada">
          <select className="cfg-input" value={modo} onChange={(e) => setModo(e.target.value)}>
            <option value="fixture">Fixture golden</option>
            <option value="id_integracao">Nota real (id_integracao)</option>
          </select>
        </Campo>
        {modo === "fixture" ? (
          <Campo label="Fixture">
            <input className="cfg-input cfg-mono" list="cfg-fixtures" value={fixture} onChange={(e) => setFixture(e.target.value)} />
            <datalist id="cfg-fixtures">
              {listaFixtures.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </Campo>
        ) : (
          <Campo label="id_integracao" ajuda="Só leitura no banco (SELECT).">
            <input
              className="cfg-input cfg-mono"
              placeholder="NFSE_..."
              value={idIntegracao}
              onChange={(e) => setIdIntegracao(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && rodar()}
            />
          </Campo>
        )}
        <button type="button" className="cfg-btn cfg-btn-primario" onClick={rodar} disabled={rodando} style={{ marginBottom: 4 }}>
          <FiPlay /> {rodando ? "Montando…" : "Rodar dry-run"}
        </button>
      </div>

      {erro && <div className="cfg-aviso cfg-aviso-perigo">{erro}</div>}

      {resultado && (
        <>
          <div className="cfg-aviso">
            <div>
              <div>
                Esta versão: <strong>{rotuloVersao(resultado.modelo)}</strong>
                {res?.builder && <Badge cor="azul">builder {res.builder}</Badge>}
                {res?.endpoint && <span className="cfg-mono"> {res.endpoint}</span>}
              </div>
              {res?.prestador && (
                <div>
                  Prestador: {res.prestador.razao_social} ({res.prestador.cnpj}) · token: <span className="cfg-mono">{res.prestador.token_env}</span>
                  {res.prestador.sintetico && <Badge cor="amarelo">sintético</Badge>}
                </div>
              )}
              <div>
                Resolução atual (regras ativas hoje): <strong>{resultado.resolucao_atual ? rotuloVersao(resultado.resolucao_atual) : "nenhuma regra casa"}</strong>
                {" · "}Versão ativa do código: <strong>{rotuloVersao(resultado.versao_ativa)}</strong>
              </div>
              {res?.hooks?.length > 0 && <div>Hooks: {res.hooks.join(", ")}</div>}
            </div>
          </div>

          {resultado.erro_versao_ativa && (
            <div className="cfg-aviso cfg-aviso-alerta">A versão ativa não montou o payload: {String(resultado.erro_versao_ativa)}</div>
          )}

          <h4 style={{ margin: "14px 0 8px" }}>Diferenças contra a versão ativa</h4>
          {resultado.diff_contra_ativa === null || resultado.diff_contra_ativa === undefined ? (
            <div className="cfg-estado">
              {resultado.versao_ativa ? "Esta já é a versão ativa." : "O código não tem versão ativa para comparar."}
            </div>
          ) : (
            <DiffLadoALado linhas={linhasDiff || []} rotuloA={rotuloVersao(resultado.versao_ativa)} rotuloB={rotuloVersao(resultado.modelo)} />
          )}

          {resultado.snapshot && (
            <>
              <h4 style={{ margin: "14px 0 8px" }}>
                Contra o snapshot golden <span className="cfg-mono cfg-ajuda">{resultado.snapshot}</span>
              </h4>
              <DiffLadoALado linhas={linhasSnapshot || []} rotuloA="Snapshot" rotuloB={rotuloVersao(resultado.modelo)} />
            </>
          )}

          <h4 style={{ margin: "14px 0 8px" }}>Payloads</h4>
          {payloadAtiva ? (
            <div className="cfg-lado-a-lado">
              <div>
                <small className="cfg-ajuda">Versão ativa — {rotuloVersao(resultado.versao_ativa)}</small>
                <JsonView valor={payloadAtiva} />
              </div>
              <div>
                <small className="cfg-ajuda">Esta versão — {rotuloVersao(resultado.modelo)}</small>
                <JsonView valor={resultado.payload} />
              </div>
            </div>
          ) : (
            <>
              {payloadAtiva === undefined && <small className="cfg-ajuda">Não foi possível montar o payload da versão ativa.</small>}
              <JsonView valor={resultado.payload} />
            </>
          )}
        </>
      )}
    </div>
  );
}
