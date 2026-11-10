// Ações de versão de modelo com motivo (contrato §4.4–4.6): clonar, ativar e desativar.
// Fluxo de travas: envia SEM `confirmar`; 409 versao_sem_regra_ativa / ultima_versao_ativa mostram a mensagem do
// backend e "Confirmar mesmo assim" (`confirmar: true`); 409 regra_invalida NÃO aceita confirmar. Após ativar, mostra o
// ResumoAtivacao (desativadas, diff de regras, simulação). Usado pela ficha do mapa e pelo wizard "Nova configuração".
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
export default function AcaoModeloModal({ acao, modelo, onFechar, onConcluido, onResumoFechado }) {
  const { enqueueSnackbar } = useSnackbar();
  const [motivo, setMotivo] = useState("");
  const [erroMotivo, setErroMotivo] = useState("");
  const [erro, setErro] = useState(null);
  const [executando, setExecutando] = useState(false);
  const [confirmacao, setConfirmacao] = useState(null);
  const [regrasInvalidas, setRegrasInvalidas] = useState(null);
  const [conflito, setConflito] = useState(null);
  const [resumo, setResumo] = useState(null);

  useEffect(() => {
    if (!acao) return;
    setMotivo("");
    setErroMotivo("");
    setErro(null);
    setConfirmacao(null);
    setRegrasInvalidas(null);
    setConflito(null);
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
    try {
      const m = motivo.trim();
      if (acao === "clonar") {
        const resp = await configService.clonarModelo(modelo.id, m);
        notificarEscrita(enqueueSnackbar, resp, `Rascunho ${modelo.codigo ?? ""} v${resp?.objeto?.versao ?? ""} criado (inativo).`);
        onConcluido?.("clonar", resp);
      } else if (acao === "ativar") {
        const resp = await configService.ativarModelo(modelo.id, m, confirmar);
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
      if (!confirmar && precisaConfirmar(e)) {
        setConfirmacao({ mensagem: mensagemBackend(e, "Esta operação exige confirmação.") });
        return;
      }
      if (codigoErro(e) === "regra_invalida") {
        setRegrasInvalidas({ mensagem: mensagemBackend(e, "Há regras ativas inválidas nesta versão."), itens: listaCampos(e) });
        enqueueSnackbar("Ativação recusada: corrija as regras desta versão.", { variant: "error" });
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
                  {executando ? "Processando…" : "Confirmar mesmo assim"}
                </button>
              ) : (
                <button type="button" className={`cfg-btn ${t.classe}`} onClick={() => executar(false)} disabled={executando || !!regrasInvalidas || !!conflito}>
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
            {confirmacao && (
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
