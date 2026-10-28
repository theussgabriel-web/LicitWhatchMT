import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  BaseCompletaPayload,
  EstatisticasMt,
  HistoricoFornecedor,
  ModoModelo,
  OpcaoCidade,
  ProcessoLicitatorio,
  ResumoBusca,
  ResumoEmpresa,
} from "./types";

const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = path.resolve(__dirname, "..");
const DATA_FILE = path.join(ROOT_DIR, "data", "pncp_mt_completo.json");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const PYTHON_EXE = "C:\\Users\\matheus.gabriel\\AppData\\Local\\Python\\pythoncore-3.14-64\\python.exe";
const CLI_SCRIPT = path.join(ROOT_DIR, "avaliar_cli.py");

console.log("Carregando base de licitações PNCP-MT em memória...");
const rawJson = fs.readFileSync(DATA_FILE, "utf-8");
const baseDados: BaseCompletaPayload = JSON.parse(rawJson);
const processos: ProcessoLicitatorio[] = baseDados.processos;
const estatisticasMt: EstatisticasMt = baseDados.estatisticasMt;

const mapaPorId = new Map<number, ProcessoLicitatorio>();
const mapaPorFornecedor = new Map<string, ProcessoLicitatorio[]>();

for (const p of processos) {
  mapaPorId.set(p.id, p);
  const listaForn = mapaPorFornecedor.get(p.fornecedorDoc) || [];
  listaForn.push(p);
  mapaPorFornecedor.set(p.fornecedorDoc, listaForn);
}

console.log(
  `Base LicitWatch MT carregada: ${processos.length.toLocaleString("pt-BR")} processos | ` +
    `${mapaPorFornecedor.size.toLocaleString("pt-BR")} empresas fornecedoras.`
);

function limparDigitos(valor: string): string {
  return (valor || "").replace(/\D/g, "");
}

function enviarJson(res: http.ServerResponse, status: number, dados: unknown): void {
  const payload = JSON.stringify(dados);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function verificaSetorTematico(p: ProcessoLicitatorio, setoresAtivos: string[]): boolean {
  if (setoresAtivos.length === 0 || setoresAtivos.length === 3) return true;
  const texto = `${p.orgaoNome} ${p.unidadeNome} ${p.categoria} ${p.objeto}`.toLowerCase();

  let match = false;
  if (setoresAtivos.includes("saude")) {
    if (
      texto.includes("saude") ||
      texto.includes("saúde") ||
      texto.includes("hospital") ||
      texto.includes("medicamento") ||
      texto.includes("médic") ||
      texto.includes("exame") ||
      texto.includes("clínic") ||
      texto.includes("clinic") ||
      texto.includes("odont")
    ) {
      match = true;
    }
  }
  if (!match && setoresAtivos.includes("educacao")) {
    if (
      texto.includes("educa") ||
      texto.includes("escola") ||
      texto.includes("ensino") ||
      texto.includes("universidade") ||
      texto.includes("creche") ||
      texto.includes("merenda") ||
      texto.includes("aluno")
    ) {
      match = true;
    }
  }
  if (!match && setoresAtivos.includes("infra")) {
    if (
      texto.includes("obra") ||
      texto.includes("engenharia") ||
      texto.includes("infraestrutura") ||
      texto.includes("constru") ||
      texto.includes("reforma") ||
      texto.includes("pavimenta") ||
      texto.includes("saneamento") ||
      texto.includes("transporte") ||
      texto.includes("veículo") ||
      texto.includes("veiculo") ||
      texto.includes("locação") ||
      texto.includes("locacao")
    ) {
      match = true;
    }
  }
  return match;
}

function obterOpcoesFiltro(modo: ModoModelo, municipioSelecionado: string) {
  const contagemCidades = new Map<
    string,
    { total: number; risco: number; somaRiscoPct: number; valorRisco: number }
  >();
  const orgaosSet = new Set<string>();
  const categoriasSet = new Set<string>();

  for (const p of processos) {
    const m = p[modo];
    const infoCid = contagemCidades.get(p.municipio) || {
      total: 0,
      risco: 0,
      somaRiscoPct: 0,
      valorRisco: 0,
    };
    infoCid.total += 1;
    infoCid.somaRiscoPct += m.riscoPercentual;
    if (m.isAnomalia) {
      infoCid.risco += 1;
      infoCid.valorRisco += p.valorGlobal;
    }
    contagemCidades.set(p.municipio, infoCid);

    if (p.categoria) categoriasSet.add(p.categoria);

    if (!municipioSelecionado || municipioSelecionado === "TODAS" || p.municipio === municipioSelecionado) {
      if (p.orgaoNome) {
        orgaosSet.add(p.orgaoNome);
      }
    }
  }

  const cidades: OpcaoCidade[] = Array.from(contagemCidades.entries())
    .map(([municipio, info]) => ({
      municipio,
      totalProcessos: info.total,
      totalComRisco: info.risco,
      riscoMedioPct: info.total > 0 ? Number((info.somaRiscoPct / info.total).toFixed(1)) : 0,
      valorEmRisco: Number(info.valorRisco.toFixed(2)),
    }))
    .sort((a, b) => a.municipio.localeCompare(b.municipio, "pt-BR"));

  const orgaos = Array.from(orgaosSet).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const categorias = Array.from(categoriasSet).sort((a, b) => a.localeCompare(b, "pt-BR"));

  return {
    estatisticasMt,
    totalCidades: cidades.length,
    totalOrgaos: orgaos.length,
    totalFornecedores: mapaPorFornecedor.size,
    cidades,
    orgaos,
    categorias,
  };
}

function selecionarEOrdenarProcessos(params: URLSearchParams): {
  modo: ModoModelo;
  filtrados: ProcessoLicitatorio[];
  resumo: ResumoBusca;
} {
  const modo: ModoModelo = params.get("modo") === "preventivo" ? "preventivo" : "auditoria";
  const municipio = (params.get("municipio") || "TODAS").trim();
  const orgao = (params.get("orgao") || "TODOS").trim();
  const categoria = (params.get("categoria") || "TODAS").trim();
  const situacao = (params.get("situacao") || "todos").trim();
  const ordenar = (params.get("ordenar") || "risco_desc").trim();
  const busca = (params.get("busca") || "").trim().toLowerCase();
  const setoresParam = (params.get("setores") || "").trim();
  const setoresAtivos = setoresParam ? setoresParam.split(",").filter(Boolean) : [];
  const buscaDigitos = limparDigitos(busca);

  const filtrados: ProcessoLicitatorio[] = [];
  let qtdComRisco = 0;
  let qtdCriticos = 0;
  let valorTotalGlobal = 0;
  let valorPotencialRisco = 0;
  let somaRiscoPct = 0;

  for (const p of processos) {
    if (municipio !== "TODAS" && p.municipio !== municipio) continue;
    if (orgao !== "TODOS" && p.orgaoNome !== orgao) continue;
    if (categoria !== "TODAS" && p.categoria !== categoria) continue;

    if (setoresAtivos.length > 0 && setoresAtivos.length < 3) {
      if (!verificaSetorTematico(p, setoresAtivos)) continue;
    }

    const dadosModo = p[modo];
    if (situacao === "risco" && !dadosModo.isAnomalia) continue;
    if (situacao === "critico" && dadosModo.nivel !== "alta") continue;
    if (situacao === "normal" && dadosModo.isAnomalia) continue;

    if (busca) {
      let bateuTexto =
        p.fornecedorNome.toLowerCase().includes(busca) ||
        p.processo.toLowerCase().includes(busca) ||
        p.idPncp.toLowerCase().includes(busca) ||
        p.empenho.toLowerCase().includes(busca) ||
        p.orgaoNome.toLowerCase().includes(busca) ||
        p.municipio.toLowerCase().includes(busca) ||
        p.objeto.toLowerCase().includes(busca) ||
        p.fornecedorDocFormatado.toLowerCase().includes(busca);

      if (!bateuTexto && buscaDigitos.length >= 4) {
        bateuTexto =
          p.fornecedorDoc.includes(buscaDigitos) ||
          p.orgaoCnpj.includes(buscaDigitos);
      }

      if (!bateuTexto) continue;
    }

    filtrados.push(p);
    somaRiscoPct += dadosModo.riscoPercentual;
    valorTotalGlobal += p.valorGlobal;

    if (dadosModo.isAnomalia) {
      qtdComRisco += 1;
      valorPotencialRisco += p.valorGlobal;
      if (dadosModo.nivel === "alta") {
        qtdCriticos += 1;
      }
    }
  }

  filtrados.sort((a, b) => {
    if (ordenar === "valor_desc") return b.valorGlobal - a.valorGlobal;
    if (ordenar === "valor_asc") return a.valorGlobal - b.valorGlobal;
    if (ordenar === "aditivos_desc") {
      if (b.numeroRetificacoes !== a.numeroRetificacoes) {
        return b.numeroRetificacoes - a.numeroRetificacoes;
      }
      return a[modo].scoreAnomalia - b[modo].scoreAnomalia;
    }
    if (ordenar === "vigencia_desc") {
      if (b.tempoVigenciaDias !== a.tempoVigenciaDias) {
        return b.tempoVigenciaDias - a.tempoVigenciaDias;
      }
      return a[modo].scoreAnomalia - b[modo].scoreAnomalia;
    }
    if (ordenar === "risco_asc") {
      return b[modo].scoreAnomalia - a[modo].scoreAnomalia;
    }
    return a[modo].scoreAnomalia - b[modo].scoreAnomalia;
  });

  const totalEncontrados = filtrados.length;
  const pctComRisco =
    totalEncontrados > 0 ? Number(((qtdComRisco / totalEncontrados) * 100).toFixed(1)) : 0;
  const eficienciaFiscal =
    totalEncontrados > 0 ? Number((100 - pctComRisco).toFixed(1)) : 100;
  const riscoMedioPct =
    totalEncontrados > 0 ? Number((somaRiscoPct / totalEncontrados).toFixed(1)) : 0;

  const resumo: ResumoBusca = {
    totalEncontrados,
    qtdComRisco,
    qtdCriticos,
    qtdSemRisco: totalEncontrados - qtdComRisco,
    percentualComRisco: pctComRisco,
    eficienciaFiscal,
    valorTotalGlobal: Number(valorTotalGlobal.toFixed(2)),
    valorPotencialRisco: Number(valorPotencialRisco.toFixed(2)),
    riscoMedioPct,
  };

  return { modo, filtrados, resumo };
}

function obterMotivoCurtoTabela(p: ProcessoLicitatorio, modo: ModoModelo): string {
  const m = p[modo];
  if (!m.isAnomalia) {
    return "Dentro do padrão de MT";
  }
  const topShap = m.shap && m.shap.length > 0 ? m.shap[0] : null;
  if (!topShap || topShap.impactoShap >= 0) {
    return "Combinação atípica de valores";
  }

  switch (topShap.codigo) {
    case "numero_retificacao":
      return `${p.numeroRetificacoes} aditivos / alterações`;
    case "valor_aditivado":
      if (p.valorInicial <= 0 && p.valorGlobal > 0) {
        return "Valor inicial R$ 0 no PNCP";
      }
      if (p.valorAditivado > 0 && p.valorInicial > 0) {
        const pct = Math.round((p.valorAditivado / p.valorInicial) * 100);
        return pct > 0 ? `Acréscimo de +${pct}% pós-edital` : "Alto acréscimo por aditivo";
      }
      if (p.valorAditivado < 0) {
        return "Redução atípica de valor";
      }
      return "Diferença de valor atípica";
    case "tempo_vigencia_dias":
      if (p.tempoVigenciaDias < 0) return "Prazo não informado";
      if (p.tempoVigenciaDias === 0) return "Vigência de 0 dias";
      if (p.tempoVigenciaDias >= 730) {
        const anos = (p.tempoVigenciaDias / 365).toFixed(1).replace(".", ",");
        return `Prazo longo (${anos} anos)`;
      }
      return `Prazo atípico (${p.tempoVigenciaDias} dias)`;
    case "proporcao_parcela_global":
      if (p.proporcaoParcelaGlobal > 1.02) {
        return `Parcela > Total (${Math.round(p.proporcaoParcelaGlobal * 100)}%)`;
      }
      if (p.proporcaoParcelaGlobal >= 0.9) {
        return "Concentrado em parcela única";
      }
      return "Proporção de parcela atípica";
    case "log_valor_global":
      if (p.valorGlobal >= 1_000_000) {
        const mi = (p.valorGlobal / 1_000_000).toFixed(1).replace(".", ",");
        return `Alto valor (R$ ${mi} Mi)`;
      }
      if (p.valorGlobal <= 100) {
        return "Valor simbólico / atípico";
      }
      return "Valor fora da faixa comum";
    default:
      return topShap.atributo;
  }
}

function filtrarProcessos(params: URLSearchParams) {
  const { modo, filtrados, resumo } = selecionarEOrdenarProcessos(params);
  const pagina = Math.max(1, Number(params.get("pagina") || 1));
  const limite = Math.min(200, Math.max(10, Number(params.get("limite") || 30)));

  const totalEncontrados = filtrados.length;
  const totalPaginas = Math.max(1, Math.ceil(totalEncontrados / limite));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const inicio = (paginaSegura - 1) * limite;
  const fatia = filtrados.slice(inicio, inicio + limite);

  const itensTabela = fatia.map((p) => {
    const m = p[modo];
    return {
      id: p.id,
      idPncp: p.idPncp,
      processo: p.processo,
      municipio: p.municipio,
      orgaoNome: p.orgaoNome,
      fornecedorNome: p.fornecedorNome,
      fornecedorDocFormatado: p.fornecedorDocFormatado,
      categoria: p.categoria,
      dataAssinatura: p.dataAssinatura,
      valorGlobal: p.valorGlobal,
      tempoVigenciaDias: p.tempoVigenciaDias,
      numeroRetificacoes: p.numeroRetificacoes,
      objetoResumido: p.objeto.length > 85 ? p.objeto.slice(0, 85) + "..." : p.objeto,
      isAnomalia: m.isAnomalia,
      riscoPercentual: m.riscoPercentual,
      scoreAnomalia: m.scoreAnomalia,
      rotuloCurto: m.rotuloCurto,
      nivel: m.nivel,
      cor: m.cor,
      motivoPrincipalCurto: obterMotivoCurtoTabela(p, modo),
    };
  });

  return {
    modo,
    resumo,
    paginacao: {
      pagina: paginaSegura,
      limite,
      totalPaginas,
      totalEncontrados,
    },
    itens: itensTabela,
  };
}

function listarEmpresas(params: URLSearchParams) {
  const modo: ModoModelo = params.get("modo") === "preventivo" ? "preventivo" : "auditoria";
  const municipio = (params.get("municipio") || "TODAS").trim();
  const busca = (params.get("busca") || "").trim().toLowerCase();
  const buscaDigitos = limparDigitos(busca);

  const listaEmpresas: ResumoEmpresa[] = [];

  for (const [doc, contratos] of mapaPorFornecedor.entries()) {
    const contratosMun =
      municipio === "TODAS" ? contratos : contratos.filter((c) => c.municipio === municipio);
    if (contratosMun.length === 0) continue;

    const ref = contratosMun[0];
    if (busca) {
      let ok =
        ref.fornecedorNome.toLowerCase().includes(busca) ||
        ref.fornecedorDocFormatado.toLowerCase().includes(busca);
      if (!ok && buscaDigitos.length >= 4) {
        ok = doc.includes(buscaDigitos);
      }
      if (!ok) continue;
    }

    let qtdComRisco = 0;
    let maiorRiscoPct = 0;
    let valorTotalContratado = 0;
    let valorEmRisco = 0;
    const cidadesSet = new Set<string>();

    for (const c of contratosMun) {
      const m = c[modo];
      cidadesSet.add(c.municipio);
      valorTotalContratado += c.valorGlobal;
      if (m.riscoPercentual > maiorRiscoPct) maiorRiscoPct = m.riscoPercentual;
      if (m.isAnomalia) {
        qtdComRisco += 1;
        valorEmRisco += c.valorGlobal;
      }
    }

    listaEmpresas.push({
      fornecedorDoc: doc,
      fornecedorDocFormatado: ref.fornecedorDocFormatado,
      fornecedorNome: ref.fornecedorNome,
      tipoPessoa: ref.tipoPessoa,
      totalProcessos: contratosMun.length,
      qtdComRisco,
      maiorRiscoPct: Number(maiorRiscoPct.toFixed(1)),
      valorTotalContratado: Number(valorTotalContratado.toFixed(2)),
      valorEmRisco: Number(valorEmRisco.toFixed(2)),
      cidadesAtuacao: Array.from(cidadesSet),
    });
  }

  listaEmpresas.sort((a, b) => {
    if (b.qtdComRisco !== a.qtdComRisco) return b.qtdComRisco - a.qtdComRisco;
    return b.maiorRiscoPct - a.maiorRiscoPct;
  });

  return {
    totalEmpresas: listaEmpresas.length,
    itens: listaEmpresas.slice(0, 100),
  };
}

function obterDetalhesProcesso(id: number, modo: ModoModelo) {
  const proc = mapaPorId.get(id);
  if (!proc) return null;

  const contratosFornecedor = mapaPorFornecedor.get(proc.fornecedorDoc) || [];
  let riscosFornecedor = 0;
  let somaValorFornecedor = 0;

  for (const cf of contratosFornecedor) {
    if (cf[modo].isAnomalia) riscosFornecedor += 1;
    somaValorFornecedor += cf.valorGlobal;
  }

  const historicoFornecedor: HistoricoFornecedor = {
    fornecedorDoc: proc.fornecedorDoc,
    fornecedorDocFormatado: proc.fornecedorDocFormatado,
    fornecedorNome: proc.fornecedorNome,
    totalContratosEstado: contratosFornecedor.length,
    contratosComRiscoEstado: riscosFornecedor,
    valorTotalEstado: Number(somaValorFornecedor.toFixed(2)),
  };

  return {
    processo: proc,
    historicoFornecedor,
  };
}

function executarSimulacaoPython(corpoJson: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_EXE, [CLI_SCRIPT], {
      cwd: ROOT_DIR,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk) => {
      stderrData += chunk.toString("utf-8");
    });

    child.on("close", (code) => {
      if (code === 0 && stdoutData.trim()) {
        try {
          resolve(JSON.parse(stdoutData.trim()));
        } catch (err) {
          reject(new Error(`Falha ao interpretar retorno JSON do Python: ${err}`));
        }
      } else {
        reject(new Error(stderrData || `Processo Python finalizou com código ${code}`));
      }
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.stdin.write(corpoJson);
    child.stdin.end();
  });
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = reqUrl.pathname;

    if (req.method === "GET" && pathname === "/api/opcoes") {
      const modo: ModoModelo = reqUrl.searchParams.get("modo") === "preventivo" ? "preventivo" : "auditoria";
      const municipio = reqUrl.searchParams.get("municipio") || "TODAS";
      enviarJson(res, 200, obterOpcoesFiltro(modo, municipio));
      return;
    }

    if (req.method === "GET" && pathname === "/api/processos") {
      enviarJson(res, 200, filtrarProcessos(reqUrl.searchParams));
      return;
    }

    if (req.method === "GET" && pathname === "/api/exportar-csv") {
      const { modo, filtrados } = selecionarEOrdenarProcessos(reqUrl.searchParams);
      const escapeCsv = (val: string | number) => {
        const s = String(val ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ");
        return `"${s}"`;
      };
      const cabecalho = [
        "ID_PNCP",
        "NUMERO_PROCESSO",
        "MUNICIPIO",
        "ORGAO_PUBLICO",
        "CNPJ_ORGAO",
        "EMPRESA_CONTRATADA",
        "CNPJ_CPF_FORNECEDOR",
        "CATEGORIA",
        "DATA_ASSINATURA",
        "VIGENCIA_DIAS",
        "TERMOS_ADITIVOS",
        "VALOR_INICIAL_BRL",
        "VALOR_GLOBAL_BRL",
        "RISCO_PERCENTUAL",
        "SITUACAO_AUDITORIA",
        "MOTIVO_PRINCIPAL_RESUMO",
        "SCORE_ISOLATION_FOREST",
        "PRINCIPAL_FATOR_SHAP",
        "OBJETO",
      ].join(";");

      const linhas = filtrados.map((p) => {
        const m = p[modo];
        const topShap = m.shap && m.shap.length > 0 ? `${m.shap[0].atributo} (${m.shap[0].impactoShap.toFixed(4)})` : "";
        return [
          escapeCsv(p.idPncp),
          escapeCsv(p.processo),
          escapeCsv(p.municipio),
          escapeCsv(p.orgaoNome),
          escapeCsv(p.orgaoCnpjFormatado),
          escapeCsv(p.fornecedorNome),
          escapeCsv(p.fornecedorDocFormatado),
          escapeCsv(p.categoria),
          escapeCsv(p.dataAssinatura),
          p.tempoVigenciaDias,
          p.numeroRetificacoes,
          p.valorInicial.toFixed(2).replace(".", ","),
          p.valorGlobal.toFixed(2).replace(".", ","),
          m.riscoPercentual.toFixed(1).replace(".", ","),
          escapeCsv(m.isAnomalia ? "COM RISCO DE ANOMALIA" : "REGULAR"),
          escapeCsv(obterMotivoCurtoTabela(p, modo)),
          m.scoreAnomalia.toFixed(6).replace(".", ","),
          escapeCsv(topShap),
          escapeCsv(p.objeto),
        ].join(";");
      });

      const csvContent = "\uFEFF" + cabecalho + "\n" + linhas.join("\n");
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="licitwatch_mt_auditoria_${modo}.csv"`,
        "Cache-Control": "no-store",
      });
      res.end(csvContent);
      return;
    }

    if (req.method === "GET" && pathname === "/api/empresas") {
      enviarJson(res, 200, listarEmpresas(reqUrl.searchParams));
      return;
    }

    if (req.method === "GET" && pathname.startsWith("/api/processos/")) {
      const idStr = pathname.replace("/api/processos/", "");
      const idNum = Number(idStr);
      const modo: ModoModelo = reqUrl.searchParams.get("modo") === "preventivo" ? "preventivo" : "auditoria";
      const detalhes = obterDetalhesProcesso(idNum, modo);
      if (!detalhes) {
        enviarJson(res, 404, { erro: "Processo não encontrado." });
        return;
      }
      enviarJson(res, 200, detalhes);
      return;
    }

    if (req.method === "POST" && pathname === "/api/simular") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString("utf-8");
      });
      req.on("end", async () => {
        try {
          const resultadoSim = await executarSimulacaoPython(body);
          enviarJson(res, 200, resultadoSim);
        } catch (err) {
          enviarJson(res, 500, { erro: String(err) });
        }
      });
      return;
    }

    let filePath = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, pathname);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end("Acesso negado.");
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Página ou recurso não encontrado.");
  } catch (erro) {
    console.error("Erro interno no servidor:", erro);
    enviarJson(res, 500, { erro: "Erro interno no servidor." });
  }
});

server.listen(PORT, () => {
  console.log("============================================================================");
  console.log(`🚀 Servidor LicitWatch MT (Node.js + TypeScript) iniciado com sucesso!`);
  console.log(`🌐 Acesse no navegador: http://localhost:${PORT}`);
  console.log("============================================================================");
});
