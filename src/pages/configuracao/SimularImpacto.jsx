// "Simular impacto": POST regras/simular/ com ativar_modelos=[id] (contrato §5.1) — quantas das últimas 200 notas
// mudariam de modelo se esta versão fosse ativada. Não grava nada. Usado no passo 3 do wizard e na ficha do mapa
// (rascunho em foco). Extraído do wizard quando a aba Regras (que tinha a simulação avulsa) foi removida (10/11/2026).
// §9.6: padrão derivado com vínculo que não confere → 400 `validacao` em `campos.ativar_modelos` ("derivacao_invalida: ...").
import { useEffect, useState } from "react";
import { useSnackbar } from "notistack";
import { FiPlay } from "react-icons/fi";
import { configService } from "../../services/config";
import { ErrosBackend } from "./componentes";
import { rotuloVersao } from "./mapaDados";
import { errosDeCampo, mensagemErro } from "./utils";

const ULTIMAS = 200;

/** props: modeloId (versão tratada como ativa na simulação), desabilitado. */
export default function SimularImpacto({ modeloId, desabilitado = false }) {
  const { enqueueSnackbar } = useSnackbar();
  const [simulacao, setSimulacao] = useState(null);
  const [erro, setErro] = useState(null);
  const [simulando, setSimulando] = useState(false);

  // Outra versão em foco: o resultado anterior não vale mais.
  useEffect(() => {
    setSimulacao(null);
    setErro(null);
  }, [modeloId]);

  const simular = async () => {
    if (modeloId == null) return;
    setSimulando(true);
    setErro(null);
    try {
      setSimulacao(await configService.simularRegras(ULTIMAS, { ativar_modelos: [modeloId] }));
    } catch (e) {
      setErro(e);
      enqueueSnackbar(mensagemErro(e, "Falha na simulação."), { variant: "error" });
    } finally {
      setSimulando(false);
    }
  };

  return (
    <div>
      <div className="cfg-acoes" style={{ marginTop: 12 }}>
        <button type="button" className="cfg-btn cfg-btn-contorno" onClick={simular} disabled={simulando || desabilitado || modeloId == null}>
          <FiPlay /> {simulando ? "Simulando…" : `Simular impacto (últimas ${ULTIMAS} notas)`}
        </button>
      </div>
      {errosDeCampo(erro).ativar_modelos && (
        <div className="cfg-aviso cfg-aviso-perigo">
          <div>
            <strong>A simulação recusou esta versão:</strong> {errosDeCampo(erro).ativar_modelos}
            {/derivacao_invalida/.test(errosDeCampo(erro).ativar_modelos) && (
              <div>O vínculo do padrão derivado não confere mais: descarte este rascunho e crie o padrão próprio de novo.</div>
            )}
          </div>
        </div>
      )}
      <ErrosBackend erro={erro} conhecidos={["ativar_modelos"]} padrao="Falha na simulação." />
      {simulacao && (
        <div className="cfg-aviso">
          <div>
            <strong>
              {simulacao.mudariam ?? 0} de {simulacao.total ?? 0} notas recentes mudariam de modelo com esta ativação.
            </strong>
            {(simulacao.resumo || []).length > 0 && (
              <ul className="cfg-lista-detalhes">
                {simulacao.resumo.map((r, i) => (
                  <li key={i}>
                    {r.atual || "nenhum"} → {r.proposto || "nenhum"}: {r.quantidade}
                  </li>
                ))}
              </ul>
            )}
            {(simulacao.sem_modelo_atual ?? 0) > 0 && <div>Sem modelo hoje: {simulacao.sem_modelo_atual}</div>}
            {(simulacao.sem_modelo_proposto ?? 0) > 0 && <div>Sem modelo após ativar: {simulacao.sem_modelo_proposto}</div>}
            {(simulacao.notas || []).length > 0 && (
              <details>
                <summary>Notas afetadas ({simulacao.notas.length})</summary>
                <ul className="cfg-lista-detalhes">
                  {simulacao.notas.slice(0, 50).map((n) => (
                    <li key={n.id} className="cfg-mono">
                      {n.id_integracao || n.id} · fatura {n.fatura || "—"} · apólice {n.apolice || "—"} ·{" "}
                      {rotuloVersao(n.atual)} → {rotuloVersao(n.proposto)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
