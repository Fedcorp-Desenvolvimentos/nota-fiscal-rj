// Ações de versão de modelo com motivo (contrato §4.4–4.6): clonar, ativar e desativar.
// Fluxo de travas: envia SEM `confirmar`; 409 versao_sem_regra_ativa / ultima_versao_ativa mostram a mensagem do
// backend e "Confirmar mesmo assim" (`confirmar: true`); 409 regra_invalida NÃO aceita confirmar. Após ativar, mostra o
// ResumoAtivacao (desativadas, diff de regras, simulação). Usado pela ficha do mapa e pelo wizard "Nova configuração".
// §9.6: com `prestadorId` (ficha/wizard de uma empresa) o ativar manda `prestador_id`; 409 `modelo_compartilhado`
// (modelo sem prestador com regra de outro dono) NÃO aceita confirmar: mostra mensagem, `campos.acao`/`campos.donos` e,
// se o pai passar `onDerivar`, o botão "Criar padrão próprio desta empresa".
// Padrão derivado: 409 `derivacao_invalida` (não confirmável; `campos.derivacao`) e 409 `origem_desatualizada`
// (confirmável: tabela `campos.diferencas` campo → {origem_gravada, versao_ativa} e "Ativar mesmo assim").
import { useEffect, useState } from "react";
import { useSnackbar } from "notistack";
import { configService } from "../../services/config";
import { CampoMotivo, ErrosBackend, ListaDetalhes, Modal } from "./componentes";
import ResumoAtivacao from "./ResumoAtivacao";
import { rotuloVersao } from "./mapaDados";
import {
  MENSAGEM_CONFLITO_CONDICAO,
  codigoErro,
  ehConflitoCondicao,
  errosDeCampo,
  listaCampos,
  mensagemBackend,
  mensagemErro,
  notificarEscrita,
  precisaConfirmar,
  validarMotivo,
} from "./utils";

const textoValor = (v) => (v === null || v === undefined || v === "" ? "∅" : typeof v === "object" ? JSON.stringify(v) : String(v));

const TEXTOS = {
  clonar: {
    titulo: (m) => `Clonar ${rotuloVersao(m)} para editar`,
    botao: "Clonar",
    classe: "cfg-btn-primario",
    aviso: "",
    texto:
      "Cria um rascunho INATIVO (nova versão do mesmo código) com todos os parâmetros e regras desta versão. Edite-o nesta ficha, valide no dry-run e ative.",
  },
  ativar: {
    titulo: (m) => `Ativar ${rotuloVersao(m)}`,
    botao: "Ativar versão",
    classe: "cfg-btn-sucesso",
    aviso: "cfg-aviso-alerta",
    texto:
      "Esta versão passa a emitir de verdade e a versão ativa atual do código é desativada na mesma operação. Regras [mapa] inativas desta versão são ativadas junto. O servidor confere o modelo e as regras antes de gravar (regra inválida bloqueia; versão sem regra ativa pede confirmação; regra com as mesmas condições de uma regra efetiva de outro modelo bloqueia). A fila aplica em até 60 s. Rollback: ativar de novo a versão anterior (ou desativar, se for a única).",
  },
  desativar: {
    titulo: (m) => `Desativar ${rotuloVersao(m)}`,
    botao: "Desativar",
    classe: "cfg-btn-perigo",
    aviso: "cfg-aviso-alerta",
    texto:
      "Sem versão ativa, as notas que resolviam este modelo caem na próxima regra (padrão da empresa ou FALLBACK). Desativar a única versão ativa do código pede confirmação. Vale para a fila em até 60 s.",
  },
};

/**
 * props: acao ("clonar"|"ativar"|"desativar"|null), modelo (detalhe §4.2), onFechar,
 *        onConcluido(tipo, resposta) — chamado após sucesso (o pai recarrega e fecha a ação),
 *        onResumoFechado() — opcional, após fechar o resumo da ativação.
 */
export default function AcaoModeloModal({ acao, modelo, prestadorId = null, onFechar, onConcluido, onResumoFechado, onDerivar }) {
  const { enqueueSnackbar } = useSnackbar();
  const [motivo, setMotivo] = useState("");
  const [erroMotivo, setErroMotivo] = useState("");
  const [erro, setErro] = useState(null);
  const [executando, setExecutando] = useState(false);
  const [confirmacao, setConfirmacao] = useState(null);
  const [regrasInvalidas, setRegrasInvalidas] = useState(null);
  const [conflito, setConflito] = useState(null);
  const [compartilhado, setCompartilhado] = useState(null); // 409 modelo_compartilhado
  const [derivacaoInvalida, setDerivacaoInvalida] = useState(null); // 409 derivacao_invalida
  const [origem, setOrigem] = useState(null); // 409 origem_desatualizada
  const [resumo, setResumo] = useState(null);

  useEffect(() => {
    if (!acao) return;
    setMotivo("");
    setErroMotivo("");
    setErro(null);
    setConfirmacao(null);
    setRegrasInvalidas(null);
    setConflito(null);
    setCompartilhado(null);
    setDerivacaoInvalida(null);
    setOrigem(null);
  }, [acao]);

  const executar = async (confirmar = false) => {
    const em = validarMotivo(motivo);
    if (em) {
      setErroMotivo(em);
      return;
    }
    setExecutando(true);
    setErroMotivo("");
    setErro(null);
    setRegrasInvalidas(null);
    setConflito(null);
    setCompartilhado(null);
    setDerivacaoInvalida(null);
    if (!confirmar) setOrigem(null);
    try {
      const m = motivo.trim();
      if (acao === "clonar") {
        const resp = await configService.clonarModelo(modelo.id, m);
        notificarEscrita(enqueueSnackbar, resp, `Rascunho ${modelo.codigo ?? ""} v${resp?.objeto?.versao ?? ""} criado (inativo).`);
        onConcluido?.("clonar", resp);
      } else if (acao === "ativar") {
        const resp = await configService.ativarModelo(modelo.id, m, confirmar, prestadorId);
        const desligadas = (resp?.desativadas || []).map((d) => `v${d.versao}`).join(", ");
        notificarEscrita(enqueueSnackbar, resp, `${rotuloVersao(modelo)} ativada${desligadas ? `; desativada(s): ${desligadas}` : ""}.`);
        setResumo({ ...resp, rotulo: rotuloVersao(modelo) });
        onConcluido?.("ativar", resp);
      } else {
        const resp = await configService.desativarModelo(modelo.id, m, confirmar);
        notificarEscrita(enqueueSnackbar, resp, `${rotuloVersao(modelo)} desativada.`);
        onConcluido?.("desativar", resp);
      }
    } catch (e) {
      const camposErro = e?.response?.data?.erro?.campos || {};
      if (!confirmar && codigoErro(e) === "origem_desatualizada") {
        setOrigem({
          mensagem: mensagemBackend(e, "A origem do padrão derivado mudou depois da derivação."),
          modeloOrigem: camposErro.modelo_origem || null,
          versaoAtiva: camposErro.versao_ativa || null,
          diferencas: camposErro.diferencas && typeof camposErro.diferencas === "object" ? camposErro.diferencas : {},
        });
        setConfirmacao({ mensagem: "", rotulo: "Ativar mesmo assim" });
        return;
      }
      if (codigoErro(e) === "derivacao_invalida") {
        const d = camposErro.derivacao;
        setDerivacaoInvalida({
          mensagem: mensagemBackend(e, "O vínculo do padrão derivado não confere."),
          itens: (Array.isArray(d) ? d : d != null ? [d] : []).map((x) => (typeof x === "string" ? x : JSON.stringify(x))),
        });
        enqueueSnackbar("Ativação recusada: vínculo do padrão derivado inválido.", { variant: "error" });
        return;
      }
      if (!confirmar && precisaConfirmar(e)) {
        setConfirmacao({ mensagem: mensagemBackend(e, "Esta operação exige confirmação.") });
        return;
      }
      if (codigoErro(e) === "regra_invalida") {
        setRegrasInvalidas({ mensagem: mensagemBackend(e, "Há regras ativas inválidas nesta versão."), itens: listaCampos(e) });
        enqueueSnackbar("Ativação recusada: corrija as regras desta versão.", { variant: "error" });
        return;
      }
      // 409 modelo_compartilhado (§9.6): ativar daqui mudaria o modelo de outros donos; não aceita confirmar.
      if (codigoErro(e) === "modelo_compartilhado") {
        const campos = e?.response?.data?.erro?.campos || {};
        const donos = Array.isArray(campos.donos) ? campos.donos : campos.donos != null ? [campos.donos] : [];
        setCompartilhado({
          mensagem: mensagemBackend(e, "Este modelo é compartilhado com outros donos."),
          acao: typeof campos.acao === "string" ? campos.acao : "",
          donos: donos.map((d) => (typeof d === "string" ? d : d?.descricao || d?.razao_social || d?.rotulo || JSON.stringify(d))),
        });
        enqueueSnackbar("Ativação recusada: modelo compartilhado com outras empresas/fallback.", { variant: "error" });
        return;
      }
      // 409 conflito_condicao (alias antigo: conflito_prioridade): não aceita confirmar.
      if (ehConflitoCondicao(e)) {
        setConflito({ mensagem: mensagemBackend(e, ""), itens: listaCampos(e) });
        enqueueSnackbar(`Ativação recusada: ${MENSAGEM_CONFLITO_CONDICAO}`, { variant: "error" });
        return;
      }
      const campos = errosDeCampo(e);
      if (campos.motivo) setErroMotivo(campos.motivo);
      setErro(e);
      enqueueSnackbar(mensagemErro(e, "Falha ao executar a ação."), { variant: "error" });
    } finally {
      setExecutando(false);
    }
  };

  const t = acao ? TEXTOS[acao] : null;

  return (
    <>
      <Modal
        aberto={!!acao && !!modelo}
        titulo={t ? t.titulo(modelo) : ""}
        onFechar={() => !executando && onFechar?.()}
        rodape={
          t && (
            <>
              <button type="button" className="cfg-btn cfg-btn-neutro" onClick={onFechar} disabled={executando}>
                Cancelar
              </button>
              {confirmacao ? (
                <button type="button" className="cfg-btn cfg-btn-perigo" onClick={() => executar(true)} disabled={executando}>
                  {executando ? "Processando…" : confirmacao.rotulo || "Confirmar mesmo assim"}
                </button>
              ) : (
                <button type="button" className={`cfg-btn ${t.classe}`} onClick={() => executar(false)} disabled={executando || !!regrasInvalidas || !!conflito || !!compartilhado || !!derivacaoInvalida}>
                  {executando ? "Processando…" : t.botao}
                </button>
              )}
            </>
          )
        }
      >
        {t && (
          <>
            <div className={`cfg-aviso ${t.aviso}`}>
              <span>{t.texto}</span>
            </div>
            {origem && (
              <div className="cfg-aviso cfg-aviso-alerta">
                <div>
                  <strong>{origem.mensagem}</strong>
                  <div>
                    Derivado de <span className="cfg-mono">{rotuloVersao(origem.modeloOrigem)}</span>; versão ativa hoje:{" "}
                    <span className="cfg-mono">{rotuloVersao(origem.versaoAtiva)}</span>. O rascunho NÃO recebeu as mudanças da nova
                    versão: aplique no rascunho o que valer (Salvar rascunho) ou ative mesmo assim.
                  </div>
                  {Object.keys(origem.diferencas).length > 0 && (
                    <div className="cfg-tabela-wrap">
                      <table className="cfg-tabela">
                        <thead>
                          <tr>
                            <th>Campo</th>
                            <th>Origem gravada ({rotuloVersao(origem.modeloOrigem)})</th>
                            <th>Versão ativa ({rotuloVersao(origem.versaoAtiva)})</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(origem.diferencas).map(([campo, v]) => (
                            <tr key={campo} className="cfg-diff-alterado">
                              <td className="cfg-mono">{campo}</td>
                              <td className="cfg-mono">{textoValor(v?.origem_gravada)}</td>
                              <td className="cfg-mono">{textoValor(v?.versao_ativa)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
            {derivacaoInvalida && (
              <div className="cfg-aviso cfg-aviso-perigo">
                <div>
                  <strong>{derivacaoInvalida.mensagem}</strong>
                  {derivacaoInvalida.itens.length > 0 && (
                    <ul className="cfg-lista-detalhes">
                      {derivacaoInvalida.itens.map((m, i) => (
                        <li key={i}>{m}</li>
                      ))}
                    </ul>
                  )}
                  Nada foi gravado. Esta trava não aceita confirmação: descarte este rascunho e crie o padrão próprio de novo.
                </div>
              </div>
            )}
            {confirmacao && confirmacao.mensagem && (
              <div className="cfg-aviso cfg-aviso-perigo">
                <div>
                  <strong>{confirmacao.mensagem}</strong>
                  <div>Nada foi gravado. Clique em “Confirmar mesmo assim” para prosseguir.</div>
                </div>
              </div>
            )}
            {regrasInvalidas && (
              <div className="cfg-aviso cfg-aviso-perigo">
                <div>
                  <strong>{regrasInvalidas.mensagem}</strong>
                  <ListaDetalhes itens={regrasInvalidas.itens} />
                  Esta trava não aceita confirmação. Confira as regras na seção “Regras desta versão” da ficha; se a regra veio de
                  um clone com outra empresa, crie a configuração de novo pelo Mapa (“+ Nova configuração”) ou acione o time técnico.
                </div>
              </div>
            )}
            {conflito && (
              <div className="cfg-aviso cfg-aviso-perigo">
                <div>
                  <strong>{MENSAGEM_CONFLITO_CONDICAO}</strong>
                  {conflito.mensagem && <div>{conflito.mensagem}</div>}
                  <ListaDetalhes itens={conflito.itens} />
                  Nada foi gravado. Esta trava não aceita confirmação: desative a outra configuração (na ficha dela) ou ajuste este
                  rascunho antes de ativar.
                </div>
              </div>
            )}
            {compartilhado && (
              <div className="cfg-aviso cfg-aviso-perigo">
                <div>
                  <strong>{compartilhado.mensagem}</strong>
                  {compartilhado.donos.length > 0 && (
                    <ul className="cfg-lista-detalhes">
                      {compartilhado.donos.map((d, i) => (
                        <li key={i}>{d}</li>
                      ))}
                    </ul>
                  )}
                  {compartilhado.acao && (
                    <div>
                      Caminho indicado: <span className="cfg-mono">{compartilhado.acao}</span>
                    </div>
                  )}
                  Nada foi gravado. Esta trava não aceita confirmação: para mudar só esta empresa, crie um padrão próprio dela.{" "}
                  {onDerivar && (
                    <button type="button" className="cfg-link-btn" onClick={onDerivar}>
                      Criar padrão próprio desta empresa
                    </button>
                  )}
                </div>
              </div>
            )}
            <ErrosBackend erro={erro} conhecidos={["motivo"]} padrao="Falha ao executar a ação." />
            <CampoMotivo valor={motivo} onChange={setMotivo} erro={erroMotivo} />
          </>
        )}
      </Modal>
      <ResumoAtivacao
        resumo={resumo}
        onFechar={() => {
          setResumo(null);
          onResumoFechado?.();
        }}
      />
    </>
  );
}
