// Resumo pós-ativação (resposta 200 de POST modelos/{id}/ativar/): versões desativadas, diff de regras
// (calculado contra o estado anterior) e simulação nas últimas 200 notas.
// Camadas fixas (10/11/2026): cada regra aparece pela camada ("Apólice", "Padrão da empresa"...) com o número em cinza.
// Padrão próprio (§9.6): ao ativar o modelo derivado, a regra padrão da empresa é REAPONTADA do compartilhado (ex.: B-1)
// para o novo (ex.: B-2); o diff traz isso em `diff_regras.reapontadas` e a tela mostra "regra X: B-1 → B-2".
import { Badge, Modal, RotuloCamada } from "./componentes";
import { camadaDe } from "./mapaDados";

const camadaRegra = (r) => camadaDe({ camada: r?.camada, regra: r });
function RotuloRegra({ r }) {
  return (
    <>
      <RotuloCamada camada={camadaRegra(r)} />
      {r.condicoes ? ` · ${r.condicoes}` : ""}
      {r.descricao ? ` · ${r.descricao}` : ""}
    </>
  );
}
const valor = (v) => (v === null || v === undefined || v === "" ? "∅" : String(v));

/** Rótulo de um modelo do reapontamento: objeto {codigo, versao} ou texto. */
const rotuloModelo = (m) => (m && typeof m === "object" ? (m.codigo ? `${m.codigo}${m.versao != null ? ` v${m.versao}` : ""}` : `#${m.id}`) : valor(m));

/** Reapontamentos de regra (lista; aceita objeto único e nomes alternativos por tolerância ao contrato). */
function listaReapontadas(resumo, diff) {
  const bruto = diff.reapontadas ?? diff.reapontada ?? resumo.reapontadas ?? resumo.regra_padrao_reapontada ?? null;
  if (!bruto) return [];
  return Array.isArray(bruto) ? bruto : [bruto];
}

export default function ResumoAtivacao({ resumo, onFechar }) {
  if (!resumo) return null;
  const diff = resumo.diff_regras || {};
  const sim = resumo.simulacao || null;
  const adicionadas = diff.adicionadas || [];
  const removidas = diff.removidas || [];
  const alteradas = diff.alteradas || [];
  const desativadas = resumo.desativadas || [];
  const reapontadas = listaReapontadas(resumo, diff);

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
              <li key={`a${r.id}`}>
                + <RotuloRegra r={r} />
              </li>
            ))}
          </ul>
        )}
        {removidas.length > 0 && (
          <ul className="cfg-lista-detalhes">
            {removidas.map((r) => (
              <li key={`r${r.id}`}>
                − <RotuloRegra r={r} />
              </li>
            ))}
          </ul>
        )}
        {alteradas.length > 0 && (
          <div className="cfg-tabela-wrap">
            <table className="cfg-tabela">
              <thead>
                <tr>
                  <th>Camada</th>
                  <th>Campo</th>
                  <th>Antes</th>
                  <th>Agora</th>
                </tr>
              </thead>
              <tbody>
                {alteradas.flatMap((r) =>
                  Object.entries(r.campos || {}).map(([campo, v]) => (
                    <tr key={`${r.id_alvo ?? r.prioridade}-${campo}`} className="cfg-diff-alterado">
                      <td>
                        <RotuloCamada camada={camadaRegra(r)} />
                      </td>
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

        {reapontadas.length > 0 && (
          <>
            <h4>Regra padrão reapontada</h4>
            <ul className="cfg-lista-detalhes">
              {reapontadas.map((r, i) => (
                <li key={`p${r.id ?? r.regra_id ?? i}`}>
                  <RotuloCamada camada={camadaRegra({ camada: "padrao", ...r })} />
                  {r.id ?? r.regra_id ? ` (regra ${r.id ?? r.regra_id})` : ""}:{" "}
                  <strong className="cfg-mono">{rotuloModelo(r.modelo_anterior ?? r.de ?? r.antes)}</strong> →{" "}
                  <strong className="cfg-mono">{rotuloModelo(r.modelo_novo ?? r.para ?? r.depois)}</strong>
                  {r.condicoes ? <span className="cfg-mono"> · {r.condicoes}</span> : null}
                </li>
              ))}
            </ul>
            <small className="cfg-ajuda">
              O padrão desta empresa passou a usar o modelo próprio; o modelo compartilhado continua valendo para as demais empresas
              (e como fallback geral). Rollback: desativar o modelo novo.
            </small>
          </>
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
