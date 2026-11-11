// "Criar padrão próprio desta empresa" (contrato §9.6): o padrão da empresa usa um modelo COMPARTILHADO (ex.: B-1, que
// também é o fallback geral) e por isso não pode ser clonado/editado ali sem afetar as demais empresas.
// POST mapa/{prestador_id}/padrao/derivar/ {motivo, codigo_sugerido?} cria um modelo só da empresa (rascunho, código
// novo, ex.: B-2) a partir do compartilhado; ao ATIVAR o rascunho, a regra padrão da empresa é reapontada para ele e o
// compartilhado segue valendo para as demais. Sucesso → onConcluido(resposta); o pai abre o rascunho no passo
// "Parâmetros" do wizard.
import { useEffect, useState } from "react";
import { useSnackbar } from "notistack";
import { configService } from "../../services/config";
import { Campo, CampoMotivo, ErrosBackend, Modal } from "./componentes";
import { rotuloVersao, textoPadraoCompartilhado } from "./mapaDados";
import { codigoErro, errosDeCampo, mensagemBackend, mensagemErro, notificarEscrita, validarMotivo } from "./utils";

/** `erro.campos` cru (os 409 trazem `modelo_id`/`acao`). */
const camposCrus = (e) => e?.response?.data?.erro?.campos || {};

/** 409 específicos da derivação (§9.6) → texto do que fazer. */
const TEXTOS_409 = {
  derivacao_pendente: "Já existe um padrão próprio desta empresa em rascunho, ainda não ativado: edite/ative esse rascunho em vez de criar outro.",
  padrao_nao_compartilhado: "O padrão desta empresa já é um modelo só dela: use \"Clonar para editar\" na ficha.",
  sem_padrao_proprio: "Esta empresa não tem padrão próprio (cai no fallback geral): use \"Criar padrão da empresa\".",
  padrao_inativo: "O padrão próprio desta empresa existe, mas está desativado: reative-o em vez de criar outro.",
};

/**
 * props: aberto, prestadorId, nomeEmpresa, modelo (o compartilhado, para o texto), fallback (bool: o compartilhado é o
 *        fallback geral), onFechar, onConcluido(resposta), onAbrirPendente(modeloId) — 409 derivacao_pendente,
 *        onReativar(modeloId) — 409 padrao_inativo.
 */
export default function DerivarPadraoModal({
  aberto,
  prestadorId,
  nomeEmpresa,
  modelo,
  fallback = true,
  onFechar,
  onConcluido,
  onAbrirPendente,
  onReativar,
}) {
  const { enqueueSnackbar } = useSnackbar();
  const [motivo, setMotivo] = useState("");
  const [codigo, setCodigo] = useState("");
  const [erros, setErros] = useState({});
  const [erro, setErro] = useState(null);
  const [executando, setExecutando] = useState(false);
  const [recusa, setRecusa] = useState(null); // {codigo, mensagem, modeloId}

  useEffect(() => {
    if (!aberto) return;
    setMotivo("");
    setCodigo("");
    setErros({});
    setErro(null);
    setRecusa(null);
  }, [aberto]);

  const executar = async () => {
    const em = validarMotivo(motivo);
    if (em) {
      setErros({ motivo: em });
      return;
    }
    setExecutando(true);
    setErros({});
    setErro(null);
    setRecusa(null);
    try {
      const resp = await configService.derivarPadraoMapa(prestadorId, motivo.trim(), codigo.trim().toUpperCase());
      const m = resp?.objeto?.modelo;
      notificarEscrita(enqueueSnackbar, resp, `Padrão próprio ${rotuloVersao(m)} criado como rascunho (ainda não emite).`);
      onConcluido?.(resp);
    } catch (e) {
      const codigo409 = codigoErro(e);
      if (TEXTOS_409[codigo409]) {
        setRecusa({ codigo: codigo409, mensagem: mensagemBackend(e, ""), modeloId: camposCrus(e).modelo_id ?? null });
        enqueueSnackbar(TEXTOS_409[codigo409], { variant: "warning" });
        return;
      }
      const campos = errosDeCampo(e);
      const mapeados = {};
      if (campos.motivo) mapeados.motivo = campos.motivo;
      if (campos.codigo_sugerido) mapeados.codigo_sugerido = campos.codigo_sugerido;
      setErros(mapeados);
      setErro(e);
      enqueueSnackbar(mensagemErro(e, "Falha ao criar o padrão próprio."), { variant: "error" });
    } finally {
      setExecutando(false);
    }
  };

  return (
    <Modal
      aberto={aberto}
      titulo={`Criar padrão próprio — ${nomeEmpresa || `prestador #${prestadorId}`}`}
      onFechar={() => !executando && onFechar?.()}
      rodape={
        <>
          <button type="button" className="cfg-btn cfg-btn-neutro" onClick={onFechar} disabled={executando}>
            Cancelar
          </button>
          <button type="button" className="cfg-btn cfg-btn-primario" onClick={executar} disabled={executando || !!recusa}>
            {executando ? "Criando…" : "Criar rascunho e editar"}
          </button>
        </>
      }
    >
      <div className="cfg-aviso">
        <span>
          {textoPadraoCompartilhado(modelo, { fallback })} O rascunho nasce com os mesmos parâmetros do {modelo?.codigo || "modelo atual"} e
          NÃO emite até ser ativado; ao ativar, o padrão desta empresa passa a usar o modelo novo (a regra padrão é
          reapontada). Rollback: desativar o modelo novo — a empresa volta a cair no fallback geral.
        </span>
      </div>
      {recusa && (
        <div className="cfg-aviso cfg-aviso-alerta">
          <div>
            <strong>{TEXTOS_409[recusa.codigo]}</strong>
            {recusa.mensagem && <div>{recusa.mensagem}</div>}
            <div>Nada foi gravado.</div>
            {recusa.codigo === "derivacao_pendente" && recusa.modeloId != null && onAbrirPendente && (
              <button type="button" className="cfg-link-btn" onClick={() => onAbrirPendente(recusa.modeloId)}>
                Abrir o rascunho existente
              </button>
            )}
            {recusa.codigo === "padrao_inativo" && recusa.modeloId != null && onReativar && (
              <button type="button" className="cfg-btn cfg-btn-sucesso cfg-btn-sm" onClick={() => onReativar(recusa.modeloId)}>
                Reativar padrão
              </button>
            )}
          </div>
        </div>
      )}
      <ErrosBackend erro={erro} conhecidos={["motivo", "codigo_sugerido"]} padrao="Falha ao criar o padrão próprio." />
      <Campo
        label="Código do modelo novo (opcional)"
        erro={erros.codigo_sugerido}
        ajuda="Vazio = próximo código livre da empresa (ex.: B-2). Formato LETRA-NÚMERO."
      >
        <input className="cfg-input" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="ex.: B-2" maxLength={10} />
      </Campo>
      <CampoMotivo valor={motivo} onChange={setMotivo} erro={erros.motivo} placeholder="Ex.: CONDOCORP passa a ter NBS próprio (chamado 123)" />
    </Modal>
  );
}
