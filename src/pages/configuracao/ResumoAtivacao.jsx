// Resumo pós-ativação (resposta 200 de POST modelos/{id}/ativar/): versões desativadas, diff de regras
// (calculado contra o estado anterior) e simulação nas últimas 200 notas.
import { Badge, Modal } from "./componentes";

const rotuloRegra = (r) => `prioridade ${r.prioridade}${r.condicoes ? ` · ${r.condicoes}` : ""}${r.descricao ? ` · ${r.descricao}` : ""}`;
const valor = (v) => (v === null || v === undefined || v === "" ? "∅" : String(v));

export default function ResumoAtivacao({ resumo, onFechar }) {
  if (!resumo) return null;
  const diff = resumo.diff_regras || {};
  const sim = resumo.simulacao || null;
  const adicionadas = diff.adicionadas || [];
  const removidas = diff.removidas || [];
  const alteradas = diff.alteradas || [];
  const desativadas = resumo.desativadas || [];

  return (
    <Modal
      aberto
      largo
      titulo={`Resumo da ativação — ${resumo.rotulo}`}
      onFechar={onFechar}
      rodape={
        <button type="button" className="cfg-btn cfg-btn-primario" onClick={onFechar}>
          Fechar
        </button>
      }
    >
      <div className="cfg-resumo">
        <div className="cfg-aviso">
          Ativação gravada. Vale para a fila em até {resumo.efetivo_em_ate_segundos ?? 60} s. Diff de regras e simulação foram
          calculados contra o estado anterior à ativação.
        </div>
        {(resumo.avisos || []).map((a, i) => (
          <div key={i} className="cfg-aviso cfg-aviso-alerta">
            {typeof a === "string" ? a : JSON.stringify(a)}
          </div>
        ))}

        <h4>Versões desativadas</h4>
        {desativadas.length ? desativadas.map((d) => <Badge key={d.id}>v{d.versao} (#{d.id})</Badge>) : <small className="cfg-ajuda">Nenhuma.</small>}

        <h4>
          Regras × versão anterior{" "}
          {diff.versao_atual ? <small className="cfg-ajuda">(v{diff.versao_atual.versao})</small> : <small className="cfg-ajuda">(código não tinha versão ativa)</small>}
        </h4>
        <div>
          <Badge cor="verde">{adicionadas.length} adicionada(s)</Badge>
          <Badge cor="vermelho">{removidas.length} removida(s)</Badge>
          <Badge cor="amarelo">{alteradas.length} alterada(s)</Badge>
        </div>
        {adicionadas.length > 0 && (
          <ul className="cfg-lista-detalhes">
            {adicionadas.map((r) => (
              <li key={`a${r.id}`}>+ {rotuloRegra(r)}</li>
            ))}
          </ul>
        )}
        {removidas.length > 0 && (
          <ul className="cfg-lista-detalhes">
            {removidas.map((r) => (
              <li key={`r${r.id}`}>− {rotuloRegra(r)}</li>
            ))}
          </ul>
        )}
        {alteradas.length > 0 && (
          <div className="cfg-tabela-wrap">
            <table className="cfg-tabela">
              <thead>
                <tr>
                  <th>Prioridade</th>
                  <th>Campo</th>
                  <th>Antes</th>
                  <th>Agora</th>
                </tr>
              </thead>
              <tbody>
                {alteradas.flatMap((r) =>
                  Object.entries(r.campos || {}).map(([campo, v]) => (
                    <tr key={`${r.prioridade}-${campo}`} className="cfg-diff-alterado">
                      <td>{r.prioridade}</td>
                      <td className="cfg-mono">{campo}</td>
                      <td className="cfg-mono">{valor(v?.atual)}</td>
                      <td className="cfg-mono">{valor(v?.alvo)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <h4>Simulação nas últimas notas</h4>
        {sim ? (
          <>
            <div>
              <strong>{sim.mudariam ?? 0}</strong> de {sim.total ?? 200} nota(s) mudariam de modelo com esta ativação.
              {sim.sem_modelo_proposto > 0 && ` ${sim.sem_modelo_proposto} ficariam sem modelo.`}
            </div>
            {(sim.resumo || []).map((r, i) => (
              <Badge key={i} cor="amarelo">
                {r.atual || "—"} → {r.proposto || "—"}: {r.quantidade}
              </Badge>
            ))}
          </>
        ) : (
          <small className="cfg-ajuda">Simulação não disponível na resposta.</small>
        )}
      </div>
    </Modal>
  );
}
