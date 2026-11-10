// Normalização das respostas de modelos (lista agrupada por código ou lista plana de versões).

/** Retorna [{codigo, nome, versoes:[...]}] ordenado por código, com versões em ordem decrescente. */
export function agruparModelos(data) {
  let grupos = [];
  const lista = Array.isArray(data) ? data : data?.results || data?.modelos || data?.grupos || [];
  const jaAgrupado = lista.length > 0 && Array.isArray(lista[0]?.versoes);
  if (jaAgrupado) {
    grupos = lista.map((g) => ({ ...g, versoes: [...g.versoes] }));
  } else if (data && !Array.isArray(data) && typeof data === "object" && !lista.length) {
    // Formato {"A-1": [versões], ...}
    grupos = Object.entries(data)
      .filter(([, v]) => Array.isArray(v))
      .map(([codigo, versoes]) => ({ codigo, versoes: [...versoes] }));
  } else {
    const mapa = new Map();
    lista.forEach((m) => {
      const codigo = m.codigo || m.slug || `#${m.id}`;
      if (!mapa.has(codigo)) mapa.set(codigo, { codigo, versoes: [] });
      mapa.get(codigo).versoes.push(m);
    });
    grupos = Array.from(mapa.values());
  }
  grupos.forEach((g) => {
    g.versoes.sort((a, b) => (b.versao || 0) - (a.versao || 0));
    g.ativa = g.versoes.find((v) => v.ativo) || null;
    g.provedor = g.provedor || g.ativa?.provedor || g.versoes[0]?.provedor || "";
    g.nome = g.nome || g.ativa?.nome || g.versoes[0]?.nome || "";
  });
  return grupos.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), "pt-BR", { numeric: true }));
}

/** Nome legível do prestador (aceita id, objeto ou string). */
export function rotuloPrestador(p, prestadores = []) {
  if (!p) return "—";
  if (typeof p === "object") return p.razao_social || p.cnpj || `#${p.id}`;
  const achado = prestadores.find((x) => String(x.id) === String(p));
  return achado ? achado.razao_social : String(p);
}
