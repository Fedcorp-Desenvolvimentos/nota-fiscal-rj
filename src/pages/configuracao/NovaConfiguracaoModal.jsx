// Modal "+ Nova configuração" de uma empresa: cria rascunho + regra para (empresa, condição) via POST mapa/criar/.
// 409 (condição já mapeada) mostra a mensagem do backend e o link para a ficha existente.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useSnackbar } from "notistack";
import { configService } from "../../services/config";
import { Campo, CampoMotivo, Modal } from "./componentes";
import { CANAIS, chaveCondicao, rotuloVersao } from "./mapaDados";
import { codigoErro, errosDeCampo, mensagemBackend, mensagemErro, notificarEscrita, validarMotivo } from "./utils";
import { agruparModelos } from "./modelosDados";

/** Regras já existentes na resposta 409 condicao_duplicada (campos.regras), como texto curto. */
function regrasDoConflito(error) {
  const regras = error?.response?.data?.erro?.campos?.regras;
  if (!Array.isArray(regras)) return [];
  return regras.map((r) => (typeof r === "string" ? r : `prioridade ${r.prioridade ?? "?"}${r.modelo ? ` → ${r.modelo.codigo ?? r.modelo}` : ""}`));
}

/**
 * props: empresa (normalizada), tipoInicial ("padrao" para criar o padrão da empresa), aberto, onFechar,
 *        onCriado(resposta, chave) — o pai recarrega o mapa e navega para a ficha.
 */
export default function NovaConfiguracaoModal({ empresa, tipoInicial = "apolice", aberto, onFechar, onCriado }) {
  const [tipo, setTipo] = useState(tipoInicial);
  const [valor, setValor] = useState("");
  const [baseId, setBaseId] = useState("");
  const [codigo, setCodigo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [modelos, setModelos] = useState([]);
  const [erros, setErros] = useState({});
  const [conflito, setConflito] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    if (!aberto) return;
    setTipo(tipoInicial);
    setValor(tipoInicial === "tipo_nfe" ? CANAIS[0].valor : "");
    // Modelo base padrão: o modelo ativo do padrão da empresa (backend usa o mesmo default se vier vazio).
    setBaseId(empresa?.padrao?.modeloAtivo?.id != null ? String(empresa.padrao.modeloAtivo.id) : "");
    setMotivo("");
    setCodigo("");
    setErros({});
    setConflito(null);
    configService
      .listarModelos()
      .then((d) => setModelos(agruparModelos(d)))
      .catch(() => setModelos([]));
  }, [aberto, tipoInicial, empresa]);

  if (!empresa) return null;

  const enviar = async () => {
    const e = {};
    const em = validarMotivo(motivo);
    if (em) e.motivo = em;
    const v = valor.trim();
    if (tipo !== "padrao" && !v) e.valor = tipo === "apolice" ? "Informe o código da apólice (ex.: PSPS01)." : "Escolha o canal.";
    setErros(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    setConflito(null);
    try {
      const corpo = {
        prestador_id: empresa.id,
        condicao: tipo === "padrao" ? { tipo: "padrao" } : { tipo, valor: v },
        motivo: motivo.trim(),
      };
      if (baseId) corpo.base_modelo_id = Number(baseId);
      if (codigo.trim()) corpo.codigo_sugerido = codigo.trim().toUpperCase();
      const resp = await configService.criarMapa(corpo);
      notificarEscrita(enqueueSnackbar, resp, "Rascunho e regra criados.");
      onCriado?.(resp, resp?.objeto?.condicao?.chave ?? chaveCondicao(tipo, v));
    } catch (err) {
      if (err?.response?.status === 409 || codigoErro(err) === "condicao_duplicada") {
        setConflito({
          mensagem: mensagemBackend(err, "Esta condição já está mapeada para a empresa."),
          regras: regrasDoConflito(err),
          link: `/configuracao/mapa/${empresa.id}/${encodeURIComponent(chaveCondicao(tipo, v))}`,
        });
      } else {
        setErros({ ...errosDeCampo(err), geral: mensagemErro(err, "Falha ao criar a configuração.") });
      }
    } finally {
      setEnviando(false);
    }
  };

  const versoes = modelos.flatMap((g) => g.versoes.map((m) => ({ ...m, grupoNome: g.nome })));

  return (
    <Modal
      aberto={aberto}
      titulo={tipoInicial === "padrao" ? `Criar padrão — ${empresa.razao_social}` : `Nova configuração — ${empresa.razao_social}`}
      onFechar={() => !enviando && onFechar?.()}
      rodape={
        <>
          <button type="button" className="cfg-btn cfg-btn-neutro" onClick={onFechar} disabled={enviando}>
            Cancelar
          </button>
          <button type="button" className="cfg-btn cfg-btn-primario" onClick={enviar} disabled={enviando}>
            {enviando ? "Criando…" : "Criar rascunho"}
          </button>
        </>
      }
    >
      <div className="cfg-aviso">
        <span>
          Cria um <strong>modelo novo inativo</strong> (cópia do modelo base, código próprio) e a regra da combinação, também
          inativa. Nada muda na emissão até você revisar os parâmetros, rodar o dry-run e ativar (a regra é ativada junto).
        </span>
      </div>
      {erros.geral && <div className="cfg-aviso cfg-aviso-perigo">{erros.geral}</div>}
      {conflito && (
        <div className="cfg-aviso cfg-aviso-alerta">
          <span>
            {conflito.mensagem}
            {conflito.regras.length > 0 && <> Regras: {conflito.regras.join("; ")}.</>} Edite o rascunho existente ou clone o
            modelo pela ficha. <Link to={conflito.link} onClick={onFechar}>Abrir a ficha existente</Link>
          </span>
        </div>
      )}

      <div className="cfg-grid">
        {tipoInicial !== "padrao" && (
          <Campo label="Tipo de condição" obrigatorio>
            <select
              className="cfg-input"
              value={tipo}
              onChange={(ev) => {
                setTipo(ev.target.value);
                setValor(ev.target.value === "tipo_nfe" ? CANAIS[0].valor : "");
              }}
            >
              <option value="apolice">Apólice</option>
              <option value="tipo_nfe">Canal</option>
            </select>
          </Campo>
        )}
        {tipo === "apolice" && (
          <Campo label="Apólice" obrigatorio erro={erros.valor || erros.condicao} ajuda="Código da apólice no FedHub (ex.: PSPS01).">
            <input className="cfg-input cfg-mono" value={valor} onChange={(ev) => setValor(ev.target.value)} placeholder="PSPS01" />
          </Campo>
        )}
        {tipo === "tipo_nfe" && (
          <Campo label="Canal" obrigatorio erro={erros.valor || erros.condicao}>
            <select className="cfg-input" value={valor} onChange={(ev) => setValor(ev.target.value)}>
              {CANAIS.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </Campo>
        )}
        <Campo label="Código do novo modelo" erro={erros.codigo_sugerido} ajuda="Opcional (ex.: A-5). Vazio = próximo código livre da empresa.">
          <input className="cfg-input cfg-mono" value={codigo} onChange={(ev) => setCodigo(ev.target.value)} placeholder="automático" />
        </Campo>
        <div className="cfg-grid-largo">
          <Campo
            label="Modelo base"
            erro={erros.base_modelo_id}
            ajuda="O rascunho nasce como cópia deste modelo. Vazio = padrão da empresa (ou o padrão geral)."
          >
            <select className="cfg-input" value={baseId} onChange={(ev) => setBaseId(ev.target.value)}>
              <option value="">Padrão da empresa (ou o padrão geral)</option>
              {versoes.map((m) => (
                <option key={m.id} value={m.id}>
                  {rotuloVersao(m)} — {m.nome || m.grupoNome || ""}
                  {m.ativo ? " (ativa)" : " (inativa)"}
                </option>
              ))}
            </select>
          </Campo>
        </div>
      </div>
      <CampoMotivo valor={motivo} onChange={setMotivo} erro={erros.motivo} />
    </Modal>
  );
}
