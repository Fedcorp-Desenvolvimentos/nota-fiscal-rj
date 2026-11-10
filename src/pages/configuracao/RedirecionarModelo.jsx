// Compatibilidade da antiga aba "Modelos" (removida em 10/11/2026: o modelo é configurado só na ficha do Mapa).
// /configuracao/modelos/:id → descobre, via GET mapa/, a combinação (empresa × condição) cuja regra usa esta versão
// (ou outra versão do mesmo código) e redireciona para /configuracao/mapa/:prestadorId/:condicao com a versão em foco.
// Sem combinação (ex.: transversais E-2/B-1 FALLBACK) ou em erro → /configuracao/mapa.
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useSnackbar } from "notistack";
import { configService } from "../../services/config";
import { normalizarMapa } from "./mapaDados";
import { mensagemErro } from "./utils";

const TIPOS_COM_FICHA = new Set(["padrao", "apolice", "tipo_nfe", "prefixo"]);

function usaVersao(comb, id, codigo) {
  if (!comb || !TIPOS_COM_FICHA.has(comb.tipo) || comb.semMapeamento) return 0;
  const versoes = [comb.modelo, comb.modeloAtivo, ...(comb.rascunhos || [])].filter(Boolean);
  if (versoes.some((v) => String(v.id) === String(id))) return 2; // a própria versão
  if (codigo && versoes.some((v) => v.codigo === codigo)) return 1; // outra versão do mesmo código
  return 0;
}

export default function RedirecionarModelo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [modelo, mapa] = await Promise.all([configService.obterModelo(id).catch(() => null), configService.listarMapa()]);
        if (cancelado) return;
        const { empresas } = normalizarMapa(mapa);
        let melhor = null;
        empresas.forEach((e) =>
          [e.padrao, ...e.condicoes].forEach((c) => {
            const nota = usaVersao(c, id, modelo?.codigo);
            if (nota && (!melhor || nota > melhor.nota)) melhor = { nota, empresa: e, comb: c };
          })
        );
        if (melhor) {
          navigate(`/configuracao/mapa/${melhor.empresa.id}/${encodeURIComponent(melhor.comb.chave)}`, {
            replace: true,
            state: { rascunhoId: Number(id) },
          });
          return;
        }
        enqueueSnackbar("A antiga tela Modelos foi unificada no Mapa de emissão; esta versão não tem ficha no mapa.", { variant: "info" });
      } catch (e) {
        if (!cancelado) enqueueSnackbar(mensagemErro(e, "Falha ao localizar a ficha deste modelo no mapa."), { variant: "warning" });
      }
      if (!cancelado) navigate("/configuracao/mapa", { replace: true });
    })();
    return () => {
      cancelado = true;
    };
  }, [id, navigate, enqueueSnackbar]);

  return <div className="cfg-card cfg-estado">Abrindo a ficha deste modelo no Mapa de emissão…</div>;
}
