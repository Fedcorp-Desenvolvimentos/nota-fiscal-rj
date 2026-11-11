// Publicar rascunho: motivo → POST modelos/{id}/publicar/. Se o backend pedir confirmação, mostra a mensagem em uma
// linha e "Publicar mesmo assim" (repete com confirmar: true).
import { useEffect, useState } from "react";
import { configService } from "../../services/config";
import { CampoMotivo, Modal } from "./componentes";
import { errosDeCampo, mensagemBackend, mensagemErro, precisaConfirmar, validarMotivo } from "./utils";

/** props: modelo ({id}) ou null (fechado), onFechar, onPublicado(resposta). */
export default function PublicarModal({ modelo, onFechar, onPublicado }) {
  const [motivo, setMotivo] = useState("");
  const [erroMotivo, setErroMotivo] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setMotivo("");
    setErroMotivo("");
    setConfirmacao("");
    setErro("");
  }, [modelo?.id]);

  const publicar = async (confirmar = false) => {
    const em = validarMotivo(motivo);
    if (em) {
      setErroMotivo(em);
      return;
    }
    setEnviando(true);
    setErro("");
    setErroMotivo("");
    try {
      const resp = await configService.publicarModelo(modelo.id, motivo.trim(), confirmar);
      onPublicado?.(resp);
    } catch (e) {
      if (!confirmar && precisaConfirmar(e)) {
        setConfirmacao(mensagemBackend(e, "Confirma a publicação?"));
      } else {
        setErroMotivo(errosDeCampo(e).motivo || "");
        setErro(mensagemErro(e, "Falha ao publicar."));
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      aberto={!!modelo}
      titulo="Publicar"
      onFechar={() => !enviando && onFechar?.()}
      rodape={
        <>
          <button type="button" className="cfg-btn cfg-btn-neutro" onClick={onFechar} disabled={enviando}>
            Cancelar
          </button>
          {confirmacao ? (
            <button type="button" className="cfg-btn cfg-btn-perigo" onClick={() => publicar(true)} disabled={enviando}>
              {enviando ? "Publicando…" : "Publicar mesmo assim"}
            </button>
          ) : (
            <button type="button" className="cfg-btn cfg-btn-sucesso" onClick={() => publicar(false)} disabled={enviando}>
              {enviando ? "Publicando…" : "Publicar"}
            </button>
          )}
        </>
      }
    >
      <CampoMotivo
        valor={motivo}
        onChange={(v) => {
          setMotivo(v);
          setConfirmacao("");
        }}
        erro={erroMotivo}
      />
      {confirmacao && <div className="cfg-aviso cfg-aviso-alerta">{confirmacao}</div>}
      {erro && <div className="cfg-aviso cfg-aviso-perigo">{erro}</div>}
    </Modal>
  );
}
