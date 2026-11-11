// Nova apólice: código + motivo → POST mapa/{id}/apolice/ (cria o rascunho) → abre a ficha para editar.
import { useEffect, useState } from "react";
import { configService } from "../../services/config";
import { Campo, CampoMotivo, Modal } from "./componentes";
import { normalizarApolice } from "./mapaDados";
import { errosDeCampo, mensagemErro, validarMotivo } from "./utils";

/** props: empresa ({id, razao_social}) ou null (fechado), onFechar, onCriada(codigo, resposta). */
export default function NovaApoliceModal({ empresa, onFechar, onCriada }) {
  const [apolice, setApolice] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setApolice("");
    setMotivo("");
    setErros({});
    setErro("");
  }, [empresa?.id]);

  const criar = async () => {
    const codigo = normalizarApolice(apolice);
    const e = {};
    if (!codigo) e.apolice = "Informe a apólice.";
    const em = validarMotivo(motivo);
    if (em) e.motivo = em;
    setErros(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    setErro("");
    try {
      const resp = await configService.criarApolice(empresa.id, codigo, motivo.trim());
      onCriada?.(codigo, resp);
    } catch (err) {
      setErros(errosDeCampo(err));
      setErro(mensagemErro(err, "Falha ao criar."));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      aberto={!!empresa}
      titulo="Nova apólice"
      onFechar={() => !enviando && onFechar?.()}
      rodape={
        <>
          <button type="button" className="cfg-btn cfg-btn-neutro" onClick={onFechar} disabled={enviando}>
            Cancelar
          </button>
          <button type="button" className="cfg-btn cfg-btn-primario" onClick={criar} disabled={enviando}>
            {enviando ? "Criando…" : "Criar"}
          </button>
        </>
      }
    >
      <Campo label="Apólice" obrigatorio erro={erros.apolice}>
        <input
          className="cfg-input cfg-mono"
          value={apolice}
          autoFocus
          placeholder="Ex.: BOAT01"
          onChange={(e) => setApolice(e.target.value.toUpperCase())}
        />
      </Campo>
      <CampoMotivo valor={motivo} onChange={setMotivo} erro={erros.motivo} />
      {erro && <div className="cfg-aviso cfg-aviso-perigo">{erro}</div>}
    </Modal>
  );
}
