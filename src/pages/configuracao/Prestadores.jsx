// Aba Prestadores: lista e edição (token_env é só o NOME da variável; o valor do token fica no servidor).
import { useCallback, useEffect, useState } from "react";
import { useSnackbar } from "notistack";
import { FiEdit2, FiRefreshCw, FiLock } from "react-icons/fi";
import { configService } from "../../services/config";
import { Badge, Campo, CampoMotivo, Estado, Indicador, ListaDetalhes, Modal } from "./componentes";
import {
  codigoErro,
  comoLista,
  errosDeCampo,
  formatarCnpj,
  listaCampos,
  mensagemBackend,
  mensagemErro,
  notificarEscrita,
  opcoesEnum,
  validarMotivo,
} from "./utils";

const PROVEDORES_PADRAO = [
  { valor: "nacional", rotulo: "Nacional (/v2/nfsen)" },
  { valor: "municipal", rotulo: "Municipal (/v2/nfse, hoje só SP)" },
];

// Editáveis segundo o contrato (cnpj, token_configurado e datas são só leitura).
const CAMPOS_EDITAVEIS = [
  "razao_social",
  "razoes_sociais_legado",
  "inscricao_municipal",
  "codigo_municipio_ibge",
  "token_env",
  "provedor_padrao",
  "ativo",
];

// Campos fiscais: prestador NÃO é versionado; mudança vale na hora para todos os modelos ativos dele
// e o backend exige `confirmar: true` (400 confirmacao_necessaria). razao_social/legado não pedem confirmação.
const CAMPOS_FISCAIS = ["inscricao_municipal", "codigo_municipio_ibge", "provedor_padrao", "token_env", "ativo"];

const valorInicial = (p, k) => {
  if (k === "ativo") return !!p.ativo;
  if (k === "razoes_sociais_legado") return (p.razoes_sociais_legado || []).join("\n");
  return p[k] ?? "";
};

const paraEnvio = (k, v) =>
  k === "razoes_sociais_legado"
    ? v
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean)
    : v;

export default function Prestadores() {
  const { enqueueSnackbar } = useSnackbar();
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [provedores, setProvedores] = useState(PROVEDORES_PADRAO);

  const [editando, setEditando] = useState(null); // prestador original
  const [form, setForm] = useState({});
  const [motivo, setMotivo] = useState("");
  const [errosForm, setErrosForm] = useState({});
  const [salvando, setSalvando] = useState(false);
  // Trava confirmável devolvida pelo backend: {mensagem, itens:[[campo, msg]]}
  const [confirmacao, setConfirmacao] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      setLista(comoLista(await configService.listarPrestadores()));
    } catch (e) {
      setErro(mensagemErro(e, "Falha ao carregar prestadores."));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    // Enums de provedor vêm do schema dos modelos, quando disponível.
    configService
      .schemaModelos()
      .then((s) => {
        const enumProv = s?.enums?.provedor;
        if (Array.isArray(enumProv) && enumProv.length) {
          setProvedores(opcoesEnum(enumProv));
        }
      })
      .catch(() => {});
  }, [carregar]);

  const abrir = (p) => {
    setEditando(p);
    setForm(CAMPOS_EDITAVEIS.reduce((acc, k) => ({ ...acc, [k]: valorInicial(p, k) }), {}));
    setMotivo("");
    setErrosForm({});
    setConfirmacao(null);
  };

  const fechar = () => {
    if (!salvando) setEditando(null);
  };

  const fiscaisAlterados = editando ? CAMPOS_FISCAIS.filter((k) => form[k] !== valorInicial(editando, k)) : [];

  const salvar = async (confirmar = false) => {
    const alterados = {};
    CAMPOS_EDITAVEIS.forEach((k) => {
      if (form[k] !== valorInicial(editando, k)) alterados[k] = paraEnvio(k, form[k]);
    });
    if (!Object.keys(alterados).length) {
      enqueueSnackbar("Nenhuma alteração para salvar.", { variant: "info" });
      return;
    }
    const erroMotivo = validarMotivo(motivo);
    if (erroMotivo) {
      setErrosForm({ motivo: erroMotivo });
      return;
    }
    setSalvando(true);
    setErrosForm({});
    try {
      const resp = await configService.atualizarPrestador(editando.id, alterados, motivo.trim(), confirmar);
      notificarEscrita(enqueueSnackbar, resp, "Prestador atualizado.");
      setConfirmacao(null);
      setEditando(null);
      carregar();
    } catch (e) {
      if (!confirmar && codigoErro(e) === "confirmacao_necessaria") {
        setConfirmacao({
          mensagem: mensagemBackend(e, "Esta alteração vale imediatamente e não é versionada."),
          itens: listaCampos(e),
        });
        return;
      }
      setErrosForm(errosDeCampo(e));
      enqueueSnackbar(mensagemErro(e, "Falha ao salvar prestador."), { variant: "error" });
    } finally {
      setSalvando(false);
    }
  };

  // Qualquer edição invalida uma confirmação pendente (o usuário confirma o que está vendo).
  const set = (k) => (e) => {
    setConfirmacao(null);
    setForm((f) => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  };

  return (
    <div className="cfg-card">
      <div className="cfg-card-titulo">
        <h2>Prestadores</h2>
        <button type="button" className="cfg-btn cfg-btn-neutro cfg-btn-sm" onClick={carregar} disabled={carregando}>
          <FiRefreshCw /> Atualizar
        </button>
      </div>

      <Estado carregando={carregando} erro={erro} vazio={!lista.length} textoVazio="Nenhum prestador cadastrado.">
        <div className="cfg-tabela-wrap">
          <table className="cfg-tabela">
            <thead>
              <tr>
                <th>CNPJ</th>
                <th>Razão social</th>
                <th>IM</th>
                <th>Município (IBGE)</th>
                <th>Provedor</th>
                <th>Token (env)</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className={p.ativo ? "" : "cfg-inativa"}>
                  <td className="cfg-mono">{formatarCnpj(p.cnpj)}</td>
                  <td>{p.razao_social}</td>
                  <td>{p.inscricao_municipal || "—"}</td>
                  <td>{p.codigo_municipio_ibge || "—"}</td>
                  <td>
                    <Badge cor={p.provedor_padrao === "municipal" ? "roxo" : "azul"}>{p.provedor_padrao || "—"}</Badge>
                  </td>
                  <td>
                    <div className="cfg-mono">{p.token_env || "—"}</div>
                    <Indicador ok={!!p.token_configurado} />
                  </td>
                  <td>{p.ativo ? <Badge cor="verde">ativo</Badge> : <Badge cor="vermelho">inativo</Badge>}</td>
                  <td>
                    <button type="button" className="cfg-btn cfg-btn-contorno cfg-btn-sm" onClick={() => abrir(p)}>
                      <FiEdit2 /> Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Estado>

      <Modal
        aberto={!!editando}
        titulo={editando ? `Editar prestador — ${editando.razao_social}` : ""}
        onFechar={fechar}
        rodape={
          <>
            <button type="button" className="cfg-btn cfg-btn-neutro" onClick={fechar} disabled={salvando}>
              Cancelar
            </button>
            {confirmacao ? (
              <button type="button" className="cfg-btn cfg-btn-perigo" onClick={() => salvar(true)} disabled={salvando}>
                {salvando ? "Salvando…" : "Confirmar mesmo assim"}
              </button>
            ) : (
              <button type="button" className="cfg-btn cfg-btn-primario" onClick={() => salvar(false)} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar"}
              </button>
            )}
          </>
        }
      >
        {editando && (
          <>
            <div className="cfg-aviso">
              <FiLock />
              <span>
                O campo <strong>token_env</strong> é apenas o <em>nome</em> da variável de ambiente do servidor que guarda o
                token da Focus. O valor do token fica só no servidor e nunca é exibido nem enviado por esta tela.
              </span>
            </div>
            {errosForm.geral && <div className="cfg-aviso cfg-aviso-perigo">{errosForm.geral}</div>}
            {fiscaisAlterados.length > 0 && (
              <div className="cfg-aviso cfg-aviso-alerta">
                <span>
                  Campo(s) fiscal(is) alterado(s): <strong>{fiscaisAlterados.join(", ")}</strong>. Prestador não é
                  versionado: a mudança vale <strong>imediatamente</strong> (até 60 s de cache) para todos os modelos ativos
                  deste prestador, sem rascunho nem rollback por versão. O servidor pedirá confirmação.
                </span>
              </div>
            )}
            {confirmacao && (
              <div className="cfg-aviso cfg-aviso-perigo">
                <div>
                  <strong>{confirmacao.mensagem}</strong>
                  <ListaDetalhes itens={confirmacao.itens} />
                  Revise e clique em “Confirmar mesmo assim” para gravar.
                </div>
              </div>
            )}
            {form.ativo === false && editando.ativo && (
              <div className="cfg-aviso cfg-aviso-alerta">
                Inativar o prestador faz as notas dele irem para “erro” na fila.
              </div>
            )}
            <div className="cfg-grid">
              <Campo label="CNPJ" ajuda="Somente leitura.">
                <input className="cfg-input cfg-mono" value={formatarCnpj(editando.cnpj)} readOnly />
              </Campo>
              <Campo label="Razão social" obrigatorio erro={errosForm.razao_social}>
                <input className="cfg-input" value={form.razao_social} onChange={set("razao_social")} />
              </Campo>
              <Campo label="Inscrição municipal" erro={errosForm.inscricao_municipal} ajuda="Obrigatória no provedor municipal.">
                <input className="cfg-input" value={form.inscricao_municipal} onChange={set("inscricao_municipal")} />
              </Campo>
              <Campo label="Código município IBGE" obrigatorio erro={errosForm.codigo_municipio_ibge} ajuda="7 dígitos (3304557 Rio, 3550308 SP).">
                <input className="cfg-input" maxLength={7} value={form.codigo_municipio_ibge} onChange={set("codigo_municipio_ibge")} />
              </Campo>
              <Campo label="Provedor padrão" erro={errosForm.provedor_padrao}>
                <select className="cfg-input" value={form.provedor_padrao} onChange={set("provedor_padrao")}>
                  {!provedores.some((o) => o.valor === form.provedor_padrao) && form.provedor_padrao && (
                    <option value={form.provedor_padrao}>{form.provedor_padrao}</option>
                  )}
                  {provedores.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo
                label="Token (nome da variável)"
                erro={errosForm.token_env}
                ajuda="Maiúsculas, ex.: FOCUS_TOKEN_CONDOMED. Variável inexistente no servidor é recusada."
              >
                <input className="cfg-input cfg-mono" value={form.token_env} onChange={set("token_env")} />
                <Indicador
                  ok={!!editando.token_configurado}
                  textoOk="variável configurada no servidor"
                  textoNao="variável vazia/ausente no servidor"
                />
              </Campo>
              <Campo erro={errosForm.ativo}>
                <label className="cfg-check">
                  <input type="checkbox" checked={!!form.ativo} onChange={set("ativo")} /> Prestador ativo
                </label>
              </Campo>
              <div className="cfg-grid-largo">
                <Campo
                  label="Razões sociais legado"
                  erro={errosForm.razoes_sociais_legado}
                  ajuda="Uma por linha (nomes antigos usados para casar notas)."
                >
                  <textarea
                    className="cfg-input"
                    rows={2}
                    value={form.razoes_sociais_legado}
                    onChange={set("razoes_sociais_legado")}
                  />
                </Campo>
              </div>
              <div className="cfg-grid-largo">
                <CampoMotivo valor={motivo} onChange={setMotivo} erro={errosForm.motivo} />
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
