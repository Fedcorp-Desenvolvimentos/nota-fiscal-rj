import { useMemo, useState, useCallback } from "react";
import LogEmissao from "../../components/LogEmissao/LogEmissao";
import {
  getNfsePreview,
  iniciarEmissao2,
} from "../../services/nfseService";
import "../../styles/emissao.css";
import { useSnackbar } from "notistack";
import { fixBrokenLatin } from "../../utils/normalizacao_textual";
import PageTemplate from "../../components/PageTemplate/PageTemplate";
import { FaFileInvoiceDollar } from "react-icons/fa";

export default function EmissaoPorFatura() {
  const [fatura, setFatura] = useState("");

  const [tipoFatura, setTipoFatura] = useState("normal");

  const [observacao, setObservacao] = useState("");
  const [codigoServico, setCodigoServico] = useState("170901");

  const [preview, setPreview] = useState(null);
  // Emissor identificado pelo backend via cedente da fatura (FedHub)
  const [emissor, setEmissor] = useState(null);
  // Histórico de NFS-e já emitidas para a fatura (vem no metadata do preview)
  const [nfseEmitidas, setNfseEmitidas] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loadingGerar, setLoadingGerar] = useState(false);
  const [loadingEmitir, setLoadingEmitir] = useState(false);
  const [progresso, setProgresso] = useState(0);

  const { enqueueSnackbar } = useSnackbar();

  const podeGerar = useMemo(() => {
    return !!fatura.trim() && fatura.trim().length >= 6;
  }, [fatura]);

  const podeEmitir = useMemo(
    () => !!preview && !loadingGerar && !loadingEmitir,
    [preview, loadingGerar, loadingEmitir]
  );

  const pushLog = useCallback((msg, tipo = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    const tipoPrefix =
      tipo === "erro" ? "❌ ERRO" :
        tipo === "sucesso" ? "✅ SUCESSO" :
          tipo === "alerta" ? "⚠️ ALERTA" : "ℹ️ INFO";

    setLogs((prev) => [...prev, `[${timestamp}] ${tipoPrefix}: ${msg}`].slice(-200));
  }, []);

  const mostrarErro = useCallback((mensagem, detalhes = null) => {
    enqueueSnackbar(mensagem, {
      variant: "error",
      autoHideDuration: 5000,
      anchorOrigin: { vertical: "top", horizontal: "right" }
    });

    pushLog(mensagem, "erro");

    if (detalhes) {
      console.error("Detalhes do erro:", detalhes);
      if (typeof detalhes === "object") pushLog(`Detalhes: ${JSON.stringify(detalhes)}`, "erro");
      else pushLog(`Detalhes: ${detalhes}`, "erro");
    }
  }, [enqueueSnackbar, pushLog]);

  const mostrarSucesso = useCallback((mensagem) => {
    enqueueSnackbar(mensagem, {
      variant: "success",
      autoHideDuration: 3000,
      anchorOrigin: { vertical: "top", horizontal: "right" }
    });
    pushLog(mensagem, "sucesso");
  }, [enqueueSnackbar, pushLog]);

  const mostrarInfo = useCallback((mensagem) => {
    enqueueSnackbar(mensagem, {
      variant: "info",
      autoHideDuration: 4000,
      anchorOrigin: { vertical: "top", horizontal: "right" }
    });
    pushLog(mensagem, "info");
  }, [enqueueSnackbar, pushLog]);

  const mostrarAlerta = useCallback((mensagem) => {
    enqueueSnackbar(mensagem, {
      variant: "warning",
      autoHideDuration: 6000,
      anchorOrigin: { vertical: "top", horizontal: "right" }
    });
    pushLog(mensagem, "alerta");
  }, [enqueueSnackbar, pushLog]);

  const handleGerar = useCallback(async (e) => {
    e?.preventDefault();

    if (!fatura.trim()) {
      mostrarErro("Informe o número da fatura");
      return;
    }

    if (fatura.trim().length < 6) {
      mostrarErro("O número da fatura deve ter pelo menos 6 dígitos");
      return;
    }

    setLoadingGerar(true);
    setPreview(null);
    setNfseEmitidas(null);
    setProgresso(0);

    mostrarInfo(`Consultando dados da fatura #${fatura}...`);

    try {
      const isParcelada = tipoFatura === "parcelada";
      const isVr = tipoFatura === "vr";

      // O emissor não é mais enviado: o backend identifica pelo cedente da fatura
      const payload = {
        protocolo_id: "NFSe_FAT_" + Date.now(),
        fatura_numero: fatura,
        observacao: observacao.trim(),
        parcela: 1,
        codigo: codigoServico,

        parcelada: isParcelada,
        vr: isVr,
        tipo_fatura: tipoFatura
      };

      const response = await getNfsePreview(payload);

      if (response.sucesso) {
        setPreview(response.data);

        const prestador = response.metadata?.prestador || response.data[0]?.prestador || null;
        setEmissor(prestador);
        if (prestador?.razaoSocial) {
          pushLog(`Emissor identificado pela fatura: ${fixBrokenLatin(prestador.razaoSocial)} - ${prestador.cpfCnpj}`, "info");
        }

        const codigoRetornado = response.data[0]?.servico?.[0]?.codigo;
        if (codigoRetornado) setCodigoServico(String(codigoRetornado));

        const emitidas = response.metadata?.nfse_emitidas || null;
        setNfseEmitidas(emitidas);
        if (emitidas?.ja_emitida) {
          mostrarAlerta(
            `Atenção: esta fatura já possui ${emitidas.total_autorizadas} NFS-e emitida(s). Confira antes de emitir novamente.`
          );
        } else if (emitidas?.total_registros > 0) {
          mostrarAlerta(
            `Esta fatura já possui ${emitidas.total_registros} registro(s) de emissão em andamento ou com erro.`
          );
        }

        mostrarSucesso("Dados carregados com sucesso! Verifique abaixo antes de emitir.");

        pushLog(`Prévia gerada: ${response.data.length} nota(s) fiscal(is) encontrada(s)`, "sucesso");
        const valorTotal = response.data.reduce(
          (acc, item) => acc + (item?.servico?.[0]?.valor?.servico || 0),
          0
        );
        pushLog(`Valor total: R$ ${valorTotal.toFixed(2)}`, "sucesso");
      } else {
        const erroMsg = response?.erro || "Falha ao obter prévia da nota.";

        if (erroMsg.includes("fatura") && erroMsg.includes("não encontrada")) {
          mostrarErro(`Fatura ${fatura} não encontrada no sistema`);
        } else if (erroMsg.includes("CNPJ") || erroMsg.includes("prestador")) {
          mostrarErro("Problema com os dados do prestador. Verifique a fatura informada.");
        } else if (erroMsg.includes("serviço") || erroMsg.includes("código")) {
          mostrarErro("Código de serviço inválido ou não configurado para esta empresa");
        } else {
          mostrarErro("Erro ao gerar prévia", erroMsg);
        }
      }
    } catch (err) {
      let mensagemErro = "Erro ao conectar com o serviço";

      if (err.response?.status === 422 && err.response?.data?.error) {
        // Backend não conseguiu identificar/validar o emissor pelo cedente da fatura
        mensagemErro = err.response.data.error;
      } else if (err.message?.includes("Network Error") || err.message?.includes("timeout")) {
        mensagemErro = "Falha na conexão com o servidor. Verifique sua internet e tente novamente.";
      } else if (err.response?.status === 500) {
        mensagemErro = "Erro interno do servidor. Tente novamente mais tarde.";
      } else if (err.response?.status === 404) {
        mensagemErro = "Serviço temporariamente indisponível";
      }

      mostrarErro(mensagemErro, err.message);
    } finally {
      setLoadingGerar(false);
    }
  }, [fatura, observacao, codigoServico, tipoFatura, mostrarErro, mostrarInfo, mostrarSucesso, mostrarAlerta, pushLog]);

  const handleEmitir = useCallback(async () => {
    if (!preview) {
      mostrarErro("Gere a prévia antes de emitir.");
      return;
    }

    if (preview.length === 0) {
      mostrarErro("Não há notas para emitir.");
      return;
    }

    setLoadingEmitir(true);
    setProgresso(10);

    mostrarInfo("Iniciando emissão da nota fiscal...");

    const notaFinal = preview.map(nota => ({
      ...nota,
      fatura_numero: fatura,
      tipo_nfe: tipoFatura === "vr" ? "vr" : "comum",
      codigo: codigoServico
    }))

    try {
      let res;
      res = await iniciarEmissao2(notaFinal);

      // let boleto = await processarBoletoSantander(fatura);

      if (res.status === "sucesso") {
        setProgresso(100);
        mostrarSucesso("Lote enviado com sucesso! Acompanhe o status das notas no setor de consultas.");
        pushLog(`Lote enviado: ${preview.length} nota(s) encaminhada(s) para processamento`, "sucesso");
        pushLog(`ID do lote: ${res.protocolo_id || "N/A"}`, "info");

        setTimeout(() => {
          setFatura("");
          setTipoFatura("normal");
          setObservacao("");
          setPreview(null);
          setEmissor(null);
          setNfseEmitidas(null);
          setCodigoServico("170901");
          setProgresso(0);
        }, 2000);
      } else {
        const erroMsg = res?.erro || res?.error || "Erro desconhecido ao enviar lote.";

        if (erroMsg.includes("valid")) {
          mostrarErro("Erro de validação nos dados da nota. Verifique a prévia.");
        } else if (erroMsg.includes("conexão") || erroMsg.includes("API") || erroMsg.includes("conectar")) {
          mostrarErro("Erro na conexão com o serviço de emissão. Tente novamente.");
        } else if (erroMsg.includes("limite") || erroMsg.includes("quota")) {
          mostrarErro("Limite de emissões atingido. Tente novamente mais tarde.");
        } else {
          mostrarErro("Falha ao enviar lote para emissão", erroMsg);
        }
      }
    } catch (err) {
      let mensagemErro = "Erro ao processar emissão";

      if (err.message?.includes("Network Error")) {
        mensagemErro = "Falha na conexão. Verifique sua internet e tente novamente.";
      } else if (err.response?.status === 429) {
        mensagemErro = "Muitas requisições. Aguarde um momento antes de tentar novamente.";
      } else if (err.response?.status === 503) {
        mensagemErro = "Serviço de emissão temporariamente indisponível.";
      }

      mostrarErro(mensagemErro, err.message);
    } finally {
      setLoadingEmitir(false);
    }
  }, [preview, fatura, tipoFatura, codigoServico, mostrarErro, mostrarInfo, mostrarSucesso, pushLog]);

  // CONDOMED ASSESSORIA (SP) é a única empresa com escolha de código de serviço
  const isCondomedAssessoria =
    (emissor?.cpfCnpj || "").replace(/\D/g, "") === "09551400000160" ||
    (emissor?.razaoSocial || "").toUpperCase().includes("CONDOMED ASSESSORIA");

  // Troca de código não exige nova prévia: atualiza o código nas notas já geradas,
  // que é de onde o backend lê (servico[0].codigo) na emissão
  const handleTrocarCodigo = useCallback((novoCodigo) => {
    setCodigoServico(novoCodigo);
    setPreview((prev) =>
      prev
        ? prev.map((nota) => ({
          ...nota,
          servico: nota.servico?.length
            ? [{ ...nota.servico[0], codigo: novoCodigo }, ...nota.servico.slice(1)]
            : nota.servico,
        }))
        : prev
    );
  }, []);

  const gerarBtnClass = useMemo(() => {
    const base = "fc-btn fc-btn--primary fc-btn--full";
    const desabilitado = !podeGerar || loadingGerar || loadingEmitir;
    return desabilitado ? `${base} fc-btn--disabled` : base;
  }, [podeGerar, loadingGerar, loadingEmitir]);

  const emitirBtnClass = useMemo(() => {
    const base = "fc-btn fc-btn--success fc-btn--full";
    const desabilitado = !podeEmitir || loadingEmitir;
    return desabilitado ? `${base} fc-btn--disabled` : base;
  }, [podeEmitir, loadingEmitir]);

  return (
    <PageTemplate
      title="Emissão · Por Fatura"
      subtitle="Preencha todos os campos obrigatórios para gerar a prévia da nota fiscal"
      icon={<FaFileInvoiceDollar />}
      className="consulta-comercial-page"
    >
      <div className="fc-page">
        <div className="fc-card">
          {/* <header className="fc-header">
            <h2 className="fc-title">Emissão · Por Fatura</h2>
            <div className="fc-subtitle">
              Preencha todos os campos obrigatórios para gerar a prévia da nota fiscal
            </div>
          </header> */}

          <form onSubmit={handleGerar} className="fc-form">
            <h3 className="fc-form-title">Dados de Importação</h3>

            <div className="fc-form-content">
              <div className="fc-row fc-row--inputs">
                <div className="fc-input-group">
                  <label className="fc-input-label">
                    Número da Fatura *
                    {fatura && fatura.length < 6 && (
                      <span className="fc-input-error"> (mínimo 6 dígitos)</span>
                    )}
                  </label>
                  <input
                    className="fc-input fc-input--grow"
                    placeholder="Ex: 161034"
                    value={fatura}
                    onChange={(e) => setFatura(e.target.value.replace(/[^\d]/g, ""))}
                    maxLength={10}
                  />
                </div>

                <div className="fc-input-group fc-input-group--narrow">
                  <label className="fc-input-label">Tipo de Fatura</label>
                  <select
                    className="fc-input fc-select"
                    value={tipoFatura}
                    onChange={(e) => setTipoFatura(e.target.value)}
                    disabled={loadingGerar || loadingEmitir}
                  >
                    <option value="normal">Fatura normal</option>
                    <option value="parcelada">Fatura parcelada</option>
                    <option value="vr">Fatura VR</option>
                  </select>
                </div>
              </div>


              <div className="fc-input-group">
                <textarea
                  className="fc-input fc-textarea"
                  placeholder="Ex: Programa de Gestão de Segurança do Trabalho para empresa XYZ..."
                  rows={3}
                  value={observacao}
                  required
                  onChange={(e) => setObservacao(e.target.value)}
                  maxLength={500}
                />
                <div className="fc-input-help">{observacao.length}/500 caracteres</div>
              </div>

              <button
                className={gerarBtnClass}
                type="submit"
                disabled={!podeGerar || loadingGerar || loadingEmitir}
                title={!podeGerar ? "Preencha todos os campos obrigatórios" : ""}
              >
                {loadingGerar ? (
                  <>
                    <span className="fc-spinner"></span>
                    GERANDO PRÉVIA...
                  </>
                ) : "GERAR PRÉVIA"}
              </button>
            </div>
          </form>

          <section className="fc-section">
            <LogEmissao entries={logs} maxHeight={120} />

            {loadingEmitir && (
              <div className="fc-progress-wrapper">
                <div className="fc-progress">
                  <div className="fc-progress-bar" style={{ width: `${progresso}%` }} />
                </div>
                <div className="fc-progress-label">{progresso}% processado</div>
              </div>
            )}
          </section>

          <section className="fc-section">
            {preview ? (
              <div className="fc-preview">
                <div className="fc-preview-header">
                  <h2 className="fc-preview-title">Conferência de Dados</h2>
                </div>

                {nfseEmitidas?.total_registros > 0 && (
                  <div className="fc-alert fc-alert--warning">
                    <strong>
                      {nfseEmitidas.ja_emitida
                        ? `⚠️ Esta fatura já possui ${nfseEmitidas.total_autorizadas} NFS-e emitida(s)!`
                        : `ℹ️ Esta fatura já possui ${nfseEmitidas.total_registros} registro(s) de emissão (pendente/erro).`}
                    </strong>
                    <ul className="fc-alert-list">
                      {nfseEmitidas.notas.slice(0, 5).map((n, i) => (
                        <li key={i}>
                          {n.numero_nfse ? `NFS-e nº ${n.numero_nfse}` : "Sem número"}
                          {" · "}{(n.situacao_prefeitura || n.status || "—").toUpperCase()}
                          {n.data_emissao_prefeitura || n.data_criacao
                            ? ` · ${new Date(n.data_emissao_prefeitura || n.data_criacao).toLocaleDateString("pt-BR")}`
                            : ""}
                          {n.tomador ? ` · ${fixBrokenLatin(n.tomador)}` : ""}
                        </li>
                      ))}
                      {nfseEmitidas.notas.length > 5 && (
                        <li>… e mais {nfseEmitidas.notas.length - 5} registro(s)</li>
                      )}
                    </ul>
                  </div>
                )}

                <div className="fc-grid">
                  <div className="fc-metric">
                    <span className="fc-label">Valor Total:</span>
                    <p className="fc-value">
                      {preview
                        .reduce(
                          (acc, item) => acc + (item?.servico?.[0]?.valor?.servico || 0),
                          0
                        )
                        .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                    </p>
                  </div>

                  <div className="fc-metric">
                    <span className="fc-label">Código de Serviço</span>
                    {isCondomedAssessoria ? (
                      <select
                        className="fc-input fc-select"
                        value={codigoServico}
                        onChange={(e) => handleTrocarCodigo(e.target.value)}
                        disabled={loadingGerar || loadingEmitir}
                      >
                        <option value="04197">04197</option>
                        <option value="3093">03093</option>
                      </select>
                    ) : (
                      <p className="fc-value">Automático</p>
                    )}
                  </div>

                  <div className="fc-grid-span" />

                  <div className="fc-metric">
                    <span className="fc-label">Nº Notas Fiscais</span>
                    <p className="fc-value">{preview.length}</p>
                  </div>

                  <div className="fc-block fc-grid-span">
                    <div className="fc-metric">
                      <span className="fc-label">Emissor:</span>
                      <p className="fc-value">
                        {fixBrokenLatin(preview[0]?.prestador?.razaoSocial)
                          .split(" ")
                          .slice(0, 2)
                          .join(" ")}{" "}
                        - {preview[0]?.prestador?.cpfCnpj}
                      </p>
                    </div>

                    <div className="fc-grid-span" />

                    <span className="fc-label">Discriminação do Serviço:</span>
                    <p className="fc-discriminacao">
                      {fixBrokenLatin(preview[0]?.servico[0]?.discriminacao)}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="fc-placeholder">
                <p>Aguardando importação de dados da fatura...</p>
                <small>Preencha os campos acima e clique em "Gerar Prévia"</small>
              </div>
            )}
          </section>
        </div>

        <footer className="fc-footer">
          <button
            className={emitirBtnClass}
            onClick={handleEmitir}
            disabled={!podeEmitir || loadingEmitir}
            title={!podeEmitir ? "Gere a prévia primeiro" : ""}
          >
            {loadingEmitir ? (
              <>
                <span className="fc-spinner"></span>
                PROCESSANDO ({progresso}%)
              </>
            ) : "EMITIR NOTA FISCAL"}
          </button>
        </footer>
      </div>
    </PageTemplate>
  );
}
