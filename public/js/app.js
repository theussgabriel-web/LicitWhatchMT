"use strict";
/**
 * Controlador Frontend em TypeScript — LicitWatch MT (Edição Institucional / Audit Grade)
 * Inclui renderização vetorial interativa dos 141 municípios reais de Mato Grosso (Malha Oficial IBGE),
 * anticolisão espacial de rótulos, índice numérico (#1 a #141), colorização por Risco ou Microrregião,
 * ordenação multicritério, exportação CSV/TXT/PDF e explicabilidade matemática TreeSHAP.
 */
// Estado Global
let modoAtual = "auditoria";
let modoCorMapa = "risco";
let mostrarNomesCidades = true;
let paginaAtual = 1;
let totalPaginasAtual = 1;
let idProcessoSelecionado = null;
let processoDetalheAtual = null;
let debounceTimer = null;
let toastTimer = null;
// Dados Geográficos dos 141 Municípios do IBGE e Estatísticas por Cidade
let dadosMapaReal = null;
const estatisticasPorCidadeNorm = new Map();
const nomeOriginalPncpPorNorm = new Map();
// Controle de Zoom, Pan e Disambiguação de Clique no Mapa SVG
let zoomScale = 1;
let panX = 0;
let panY = 0;
let isPanning = false;
let hasDraggedMap = false;
let panStartX = 0;
let panStartY = 0;
let dragOriginX = 0;
let dragOriginY = 0;
// Paleta cartográfica institucional para as 22 Microrregiões de Mato Grosso (Sem tons roxos)
const CORES_MICRORREGIOES = {
    "Aripuanã": "#86efac",
    "Alta Floresta": "#f9a8d4",
    "Colíder": "#cba37c",
    "Parecis": "#cbd5e1",
    "Arinos": "#fcd34d",
    "Alto Teles Pires": "#7dd3fc",
    "Sinop": "#60a5fa",
    "Paranatinga": "#6ee7b7",
    "Norte Araguaia": "#fdba74",
    "Canarana": "#bef264",
    "Médio Araguaia": "#93c5fd",
    "Barra do Garças": "#a5b4fc",
    "Tangará da Serra": "#bae6fd",
    "Rosário Oeste": "#fda4af",
    "Alto Paraguai": "#fbcfe8",
    "Alto Guaporé": "#fde047",
    "Jauru": "#fef08a",
    "Alto Pantanal": "#fde68a",
    "Cuiabá": "#fed7aa",
    "Rondonópolis": "#5eead4",
    "Tesouro": "#99f6e4",
    "Primavera do Leste": "#bbf7d0",
};
const POLOS_REGIONAIS = new Set([
    "cuiaba",
    "varzeagrande",
    "rondonopolis",
    "sinop",
    "tangaradaserra",
    "caceres",
    "sorriso",
    "lucasdorioverde",
    "primaveradoleste",
    "barradogarcas",
    "altafloresta",
    "juina",
    "ponteselacerda",
    "novamutum",
    "camponovodoparecis",
    "aguaBoa",
    "colider",
    "peixotodeazevedo",
    "juara",
    "aripuana",
]);
const MAPA_ESFERA = {
    M: "Municipal",
    E: "Estadual",
    F: "Federal",
};
const MAPA_PODER = {
    E: "Executivo",
    L: "Legislativo",
    J: "Judiciário",
};
function normalizarNomeCidade(nome) {
    return (nome || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}
function formatarMoeda(valor) {
    return valor.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
    });
}
function formatarMoedaCompacta(valor) {
    if (valor >= 1000000000) {
        return `R$ ${(valor / 1000000000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}B`;
    }
    if (valor >= 1000000) {
        return `R$ ${(valor / 1000000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
    }
    if (valor >= 1000) {
        return `R$ ${(valor / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
    }
    return formatarMoeda(valor);
}
function formatarNumero(valor) {
    return valor.toLocaleString("pt-BR");
}
function el(id) {
    const elem = document.getElementById(id);
    if (!elem) {
        throw new Error(`Elemento DOM #${id} não encontrado.`);
    }
    return elem;
}
function escaparHtml(texto) {
    return (texto || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function mostrarToast(mensagem) {
    const toast = el("toastNotificacao");
    const texto = el("toastTexto");
    texto.textContent = mensagem;
    toast.classList.remove("hidden");
    if (toastTimer)
        window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
        toast.classList.add("hidden");
    }, 2600);
}
async function copiarTextoComToast(valor, rotulo) {
    if (!valor || valor === "—")
        return;
    try {
        await navigator.clipboard.writeText(valor);
        mostrarToast(`${rotulo} copiado: ${valor}`);
    }
    catch {
        mostrarToast(`${rotulo}: ${valor}`);
    }
}
function obterSetoresMarcados() {
    const s = [];
    if (el("chkSetorSaude").checked)
        s.push("saude");
    if (el("chkSetorEducacao").checked)
        s.push("educacao");
    if (el("chkSetorInfra").checked)
        s.push("infra");
    return s.join(",");
}
// ============================================================================
// 1. MAPA OFICIAL DE MATO GROSSO (141 MUNICÍPIOS IBGE + 22 MICRORREGIÕES)
// ============================================================================
async function inicializarMapaRealIbge() {
    try {
        const resp = await fetch("/mt_mapa_real.json");
        dadosMapaReal = await resp.json();
        configurarZoomEPanMapa();
        atualizarLegendaMapa();
        renderizarListaIndiceMunicipios();
    }
    catch (err) {
        console.error("Erro ao carregar malha municipal oficial do IBGE:", err);
    }
}
function obterCorMunicipio(mun) {
    if (modoCorMapa === "microrregiao") {
        return CORES_MICRORREGIOES[mun.microrregiao] || "#cbd5e1";
    }
    const chave = normalizarNomeCidade(mun.nome);
    const stats = estatisticasPorCidadeNorm.get(chave);
    if (!stats || stats.totalProcessos === 0) {
        return "#e2e8f0"; // Sem contratos no recorte
    }
    if (stats.riscoMedioPct >= 58 || stats.totalComRisco >= 12) {
        return "#f87171"; // Crítico
    }
    if (stats.totalComRisco > 0 || stats.riscoMedioPct >= 34) {
        return "#fcd34d"; // Moderado
    }
    return "#a7f3d0"; // Regular
}
function atualizarLegendaMapa() {
    const box = el("legendaMapaBox");
    if (modoCorMapa === "risco") {
        box.innerHTML = `
      <div class="font-bold text-slate-500 text-[10px] uppercase tracking-wider mb-1">Semáforo de Risco</div>
      <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-sm bg-red-400 border border-red-700 shrink-0"></span><span class="text-slate-700">Crítico / Alerta Alto</span></div>
      <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-sm bg-amber-300 border border-amber-600 shrink-0"></span><span class="text-slate-700">Moderado / Com Alerta</span></div>
      <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-sm bg-emerald-200 border border-emerald-600 shrink-0"></span><span class="text-slate-700">Regular (0 Alertas)</span></div>
      <div class="flex items-center gap-2"><span class="w-3 h-3 rounded-sm bg-slate-200 border border-slate-400 shrink-0"></span><span class="text-slate-500">Sem Contratos PNCP</span></div>
    `;
    }
    else {
        let html = `<div class="font-bold text-slate-500 text-[10px] uppercase tracking-wider mb-1">22 Microrregiões (IBGE)</div><div class="space-y-1 max-h-[210px] overflow-y-auto pr-1">`;
        for (const [micro, cor] of Object.entries(CORES_MICRORREGIOES)) {
            html += `
        <div class="flex items-center gap-2 text-[10px]">
          <span class="w-2.5 h-2.5 rounded-sm border border-slate-500 shrink-0" style="background-color:${cor}"></span>
          <span class="text-slate-700 truncate">${escaparHtml(micro)}</span>
        </div>
      `;
        }
        html += `</div>`;
        box.innerHTML = html;
    }
}
function renderizarListaIndiceMunicipios() {
    if (!dadosMapaReal)
        return;
    const container = el("listaIndiceMunicipios");
    const termo = (el("inputBuscaIndiceMapa").value || "").trim().toLowerCase();
    const termoNorm = normalizarNomeCidade(termo);
    const cidadeSelecionadaPncp = el("selectCidade").value || "TODAS";
    const chaveSelecionada = cidadeSelecionadaPncp === "TODAS" ? "" : normalizarNomeCidade(cidadeSelecionadaPncp);
    const ordenados = [...dadosMapaReal.municipios].sort((a, b) => a.numeroMapa - b.numeroMapa);
    let html = "";
    for (const mun of ordenados) {
        const chave = normalizarNomeCidade(mun.nome);
        if (termo &&
            !chave.includes(termoNorm) &&
            !String(mun.numeroMapa).includes(termo) &&
            !mun.microrregiao.toLowerCase().includes(termo)) {
            continue;
        }
        const stats = estatisticasPorCidadeNorm.get(chave);
        const totProc = stats ? stats.totalProcessos : 0;
        const totRisco = stats ? stats.totalComRisco : 0;
        const isSel = chaveSelecionada !== "" && chave === chaveSelecionada;
        const bgRow = isSel ? "bg-blue-50 border-l-4 border-l-blue-600" : "hover:bg-slate-50";
        const badgeAlerta = totRisco > 0
            ? `<span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">${totRisco}</span>`
            : totProc > 0
                ? `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">${totProc}</span>`
                : `<span class="text-[10px] font-mono text-slate-400">0</span>`;
        html += `
      <button
        type="button"
        data-chave="${chave}"
        data-nome="${escaparHtml(mun.nome)}"
        data-micro="${escaparHtml(mun.microrregiao)}"
        class="btn-item-indice w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors ${bgRow}"
      >
        <div class="min-w-0">
          <div class="font-semibold text-slate-800 truncate">
            <span class="font-mono text-[10px] text-slate-400 mr-1">#${mun.numeroMapa}</span>${escaparHtml(mun.nome)}
          </div>
          <div class="text-[10px] text-slate-400 truncate">${escaparHtml(mun.microrregiao)}</div>
        </div>
        ${badgeAlerta}
      </button>
    `;
    }
    container.innerHTML =
        html ||
            `<div class="p-4 text-center text-slate-400 text-xs">Nenhum município encontrado.</div>`;
    container.querySelectorAll(".btn-item-indice").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const chave = btn.getAttribute("data-chave") || "";
            const nomeIbge = btn.getAttribute("data-nome") || "";
            const micro = btn.getAttribute("data-micro") || "";
            await selecionarMunicipioNoMapa(chave, nomeIbge, micro);
        });
    });
}
async function selecionarMunicipioNoMapa(chave, nomeIbge, micro) {
    el("mapCardMicrorregiao").textContent = micro;
    const nomePncp = nomeOriginalPncpPorNorm.get(chave);
    const selectCidade = el("selectCidade");
    if (nomePncp) {
        if (selectCidade.value === nomePncp) {
            selectCidade.value = "TODAS";
            el("mapCardMicrorregiao").textContent = "Todas (22)";
        }
        else {
            selectCidade.value = nomePncp;
        }
        el("selectOrgao").value = "TODOS";
        await carregarOpcoesFiltro(true);
        await buscarProcessos(1, false);
    }
    else {
        el("mapCardNomeCidade").textContent = `${nomeIbge} (Sem Contratos)`;
        el("mapCardTotalProc").textContent = "0";
        el("mapCardAlertas").textContent = "0";
        el("mapCardRiscoMedio").textContent = "0,0%";
        mostrarToast(`${nomeIbge} não possui contratos publicados neste recorte do PNCP.`);
    }
}
function desenharCamadasMapaSvg() {
    if (!dadosMapaReal)
        return;
    const grupoPoligonos = document.getElementById("grupoCamadaPoligonos");
    const grupoNomes = document.getElementById("grupoCamadaNomes");
    if (!grupoPoligonos || !grupoNomes)
        return;
    const cidadeSelecionadaPncp = el("selectCidade").value || "TODAS";
    const chaveSelecionada = cidadeSelecionadaPncp === "TODAS" ? "" : normalizarNomeCidade(cidadeSelecionadaPncp);
    let htmlPaths = "";
    for (const mun of dadosMapaReal.municipios) {
        const chaveMun = normalizarNomeCidade(mun.nome);
        const isSel = chaveSelecionada !== "" && chaveMun === chaveSelecionada;
        const corFill = obterCorMunicipio(mun);
        const classeSel = isSel ? "mun-poly-selected" : "";
        htmlPaths += `<path
      data-nome-ibge="${escaparHtml(mun.nome)}"
      data-chave="${chaveMun}"
      data-micro="${escaparHtml(mun.microrregiao)}"
      data-num="${mun.numeroMapa}"
      class="mun-poly ${classeSel}"
      fill="${corFill}"
      d="${mun.d}"
    />`;
    }
    grupoPoligonos.innerHTML = htmlPaths;
    // Renderização inteligente de rótulos com anticolisão espacial (evita sobreposição em zoom 1x)
    let htmlLabels = "";
    if (mostrarNomesCidades) {
        const candidatos = [...dadosMapaReal.municipios].sort((a, b) => {
            const ca = normalizarNomeCidade(a.nome);
            const cb = normalizarNomeCidade(b.nome);
            if (ca === chaveSelecionada)
                return -1;
            if (cb === chaveSelecionada)
                return 1;
            const pa = POLOS_REGIONAIS.has(ca) ? 1 : 0;
            const pb = POLOS_REGIONAIS.has(cb) ? 1 : 0;
            if (pa !== pb)
                return pb - pa;
            return b.areaRelativa - a.areaRelativa;
        });
        const caixasOcupadas = [];
        for (const mun of candidatos) {
            const chaveMun = normalizarNomeCidade(mun.nome);
            const isSel = chaveSelecionada !== "" && chaveMun === chaveSelecionada;
            const isPolo = POLOS_REGIONAIS.has(chaveMun);
            const baseFont = isSel || isPolo ? 7.8 : mun.areaRelativa > 0.6 ? 7.2 : mun.areaRelativa >= 0.14 ? 5.8 : 4.5;
            const fontSize = Math.max(3.2, Math.min(9.2, baseFont / Math.pow(zoomScale, 0.52)));
            // Em zoom alto (>= 2.6x) exibimos 100% dos nomes sem ocultar por colisão
            if (!isSel && zoomScale < 2.6) {
                const halfW = (mun.nome.length * fontSize * 0.28) / Math.pow(zoomScale, 0.35);
                const halfH = (fontSize * 0.68) / Math.pow(zoomScale, 0.35);
                const box = {
                    x1: mun.cx - halfW,
                    y1: mun.cy - halfH,
                    x2: mun.cx + halfW,
                    y2: mun.cy + halfH,
                };
                const colidiu = caixasOcupadas.some((b) => !(box.x2 < b.x1 || box.x1 > b.x2 || box.y2 < b.y1 || box.y1 > b.y2));
                if (colidiu)
                    continue;
                caixasOcupadas.push(box);
            }
            const classeLabelSel = isSel ? "mun-label-selected" : "";
            htmlLabels += `<text
        x="${mun.cx}"
        y="${mun.cy}"
        font-size="${fontSize.toFixed(1)}"
        class="mun-label ${classeLabelSel}"
      >${escaparHtml(mun.nome)}</text>`;
        }
    }
    grupoNomes.innerHTML = htmlLabels;
    // Eventos de Hover (Tooltip) e Clique em cada um dos 141 Municípios
    const tooltip = el("mapTooltip");
    const container = el("map-container");
    grupoPoligonos.querySelectorAll("path.mun-poly").forEach((pathEl) => {
        pathEl.addEventListener("mousemove", (ev) => {
            const mouseEv = ev;
            const nomeIbge = pathEl.getAttribute("data-nome-ibge") || "";
            const chave = pathEl.getAttribute("data-chave") || "";
            const micro = pathEl.getAttribute("data-micro") || "";
            const numMapa = pathEl.getAttribute("data-num") || "";
            const stats = estatisticasPorCidadeNorm.get(chave);
            const totProc = stats ? stats.totalProcessos : 0;
            const totRisco = stats ? stats.totalComRisco : 0;
            const riscoMed = stats ? stats.riscoMedioPct : 0;
            const valRisco = stats ? stats.valorEmRisco : 0;
            tooltip.innerHTML = `
        <div class="font-bold text-amber-400 text-xs flex items-center justify-between gap-3 border-b border-slate-700 pb-1.5 mb-2">
          <span><span class="font-mono text-slate-400 mr-1">#${numMapa}</span>${escaparHtml(nomeIbge)}</span>
          <span class="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-normal">${escaparHtml(micro)}</span>
        </div>
        <div class="space-y-1 text-[11px]">
          <div class="flex justify-between gap-4">
            <span class="text-slate-400">Processos no PNCP:</span>
            <strong class="text-white font-mono">${formatarNumero(totProc)}</strong>
          </div>
          <div class="flex justify-between gap-4">
            <span class="text-slate-400">Alertas de Risco:</span>
            <strong class="font-mono ${totRisco > 0 ? "text-red-400" : "text-emerald-400"}">${formatarNumero(totRisco)}</strong>
          </div>
          <div class="flex justify-between gap-4">
            <span class="text-slate-400">Risco Médio IA:</span>
            <strong class="text-white font-mono">${riscoMed.toFixed(1)}%</strong>
          </div>
          <div class="flex justify-between gap-4">
            <span class="text-slate-400">Volume em Risco:</span>
            <strong class="text-amber-300 font-mono">${formatarMoedaCompacta(valRisco)}</strong>
          </div>
        </div>
        <div class="mt-2 pt-1.5 border-t border-slate-800 text-[10px] text-blue-300 flex items-center justify-center gap-1">
          <i class="fa-solid fa-hand-pointer text-[9px]"></i> Clique para filtrar os processos da cidade
        </div>
      `;
            const rect = container.getBoundingClientRect();
            let left = mouseEv.clientX - rect.left + 16;
            let top = mouseEv.clientY - rect.top + 16;
            if (left + 240 > rect.width)
                left = mouseEv.clientX - rect.left - 245;
            if (top + 160 > rect.height)
                top = mouseEv.clientY - rect.top - 165;
            tooltip.style.left = `${Math.max(8, left)}px`;
            tooltip.style.top = `${Math.max(8, top)}px`;
            tooltip.classList.remove("hidden");
        });
        pathEl.addEventListener("mouseleave", () => {
            tooltip.classList.add("hidden");
        });
        pathEl.addEventListener("click", async (ev) => {
            ev.stopPropagation();
            if (hasDraggedMap)
                return;
            const chave = pathEl.getAttribute("data-chave") || "";
            const nomeIbge = pathEl.getAttribute("data-nome-ibge") || "";
            const micro = pathEl.getAttribute("data-micro") || "";
            await selecionarMunicipioNoMapa(chave, nomeIbge, micro);
        });
    });
    renderizarListaIndiceMunicipios();
}
function aplicarTransformacaoZoomMapa() {
    const grupoPoligonos = document.getElementById("grupoCamadaPoligonos");
    const grupoNomes = document.getElementById("grupoCamadaNomes");
    if (!grupoPoligonos || !grupoNomes)
        return;
    const transformStr = `translate(${panX.toFixed(1)}, ${panY.toFixed(1)}) scale(${zoomScale.toFixed(2)})`;
    grupoPoligonos.setAttribute("transform", transformStr);
    grupoNomes.setAttribute("transform", transformStr);
}
function configurarZoomEPanMapa() {
    const svg = el("svgMapaRealMt");
    const alterarZoom = (fator) => {
        const novoZoom = Math.min(5.5, Math.max(1.0, zoomScale * fator));
        if (novoZoom === 1.0) {
            panX = 0;
            panY = 0;
        }
        else {
            const cx = 500;
            const cy = 460;
            panX = cx - ((cx - panX) / zoomScale) * novoZoom;
            panY = cy - ((cy - panY) / zoomScale) * novoZoom;
        }
        zoomScale = novoZoom;
        desenharCamadasMapaSvg();
        aplicarTransformacaoZoomMapa();
    };
    el("btnZoomIn").addEventListener("click", () => alterarZoom(1.35));
    el("btnZoomOut").addEventListener("click", () => alterarZoom(1 / 1.35));
    el("btnZoomReset").addEventListener("click", () => {
        zoomScale = 1.0;
        panX = 0;
        panY = 0;
        desenharCamadasMapaSvg();
        aplicarTransformacaoZoomMapa();
    });
    svg.addEventListener("wheel", (ev) => {
        ev.preventDefault();
        alterarZoom(ev.deltaY < 0 ? 1.22 : 1 / 1.22);
    }, { passive: false });
    svg.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0)
            return;
        isPanning = true;
        hasDraggedMap = false;
        dragOriginX = ev.clientX;
        dragOriginY = ev.clientY;
        panStartX = ev.clientX - panX;
        panStartY = ev.clientY - panY;
    });
    window.addEventListener("mousemove", (ev) => {
        if (!isPanning)
            return;
        if (Math.hypot(ev.clientX - dragOriginX, ev.clientY - dragOriginY) > 5) {
            hasDraggedMap = true;
        }
        panX = ev.clientX - panStartX;
        panY = ev.clientY - panStartY;
        aplicarTransformacaoZoomMapa();
    });
    window.addEventListener("mouseup", () => {
        isPanning = false;
    });
}
// ============================================================================
// 2. CARREGAR OPÇÕES DE CIDADES, ÓRGÃOS E CATEGORIAS
// ============================================================================
async function carregarOpcoesFiltro(preservarSelecao = true) {
    const selectCidade = el("selectCidade");
    const selectOrgao = el("selectOrgao");
    const selectCategoria = el("selectCategoria");
    const cidadeAnterior = preservarSelecao ? selectCidade.value || "TODAS" : "TODAS";
    const orgaoAnterior = preservarSelecao ? selectOrgao.value || "TODOS" : "TODOS";
    const categoriaAnterior = preservarSelecao ? selectCategoria.value || "TODAS" : "TODAS";
    const resp = await fetch(`/api/opcoes?modo=${modoAtual}&municipio=${encodeURIComponent(cidadeAnterior)}`);
    const dados = await resp.json();
    estatisticasPorCidadeNorm.clear();
    nomeOriginalPncpPorNorm.clear();
    let htmlCidades = `<option value="TODAS">Todos os Municípios de MT (${formatarNumero(dados.estatisticasMt.total_contratos)} processos)</option>`;
    for (const c of dados.cidades) {
        const chave = normalizarNomeCidade(c.municipio);
        estatisticasPorCidadeNorm.set(chave, c);
        nomeOriginalPncpPorNorm.set(chave, c.municipio);
        const sel = c.municipio === cidadeAnterior ? "selected" : "";
        htmlCidades += `<option value="${escaparHtml(c.municipio)}" ${sel}>${escaparHtml(c.municipio)} (${c.totalProcessos} proc. | ${c.totalComRisco} alertas)</option>`;
    }
    selectCidade.innerHTML = htmlCidades;
    let htmlOrgaos = `<option value="TODOS">Todos os Órgãos Públicos (${dados.orgaos.length})</option>`;
    for (const org of dados.orgaos) {
        const sel = org === orgaoAnterior ? "selected" : "";
        htmlOrgaos += `<option value="${escaparHtml(org)}" ${sel}>${escaparHtml(org)}</option>`;
    }
    selectOrgao.innerHTML = htmlOrgaos;
    let htmlCategorias = `<option value="TODAS">Todas as Categorias (${dados.categorias.length})</option>`;
    for (const cat of dados.categorias) {
        const sel = cat === categoriaAnterior ? "selected" : "";
        htmlCategorias += `<option value="${escaparHtml(cat)}" ${sel}>${escaparHtml(cat)}</option>`;
    }
    selectCategoria.innerHTML = htmlCategorias;
    desenharCamadasMapaSvg();
    aplicarTransformacaoZoomMapa();
}
// ============================================================================
// 3. BUSCAR E ATUALIZAR DASHBOARD, CHIPS DE FILTRO, MAPA E TABELA
// ============================================================================
function obterParametrosBuscaAtuais() {
    const municipio = el("selectCidade").value || "TODAS";
    const orgao = el("selectOrgao").value || "TODOS";
    const categoria = el("selectCategoria").value || "TODAS";
    const situacao = el("selectSituacao").value || "todos";
    const ordenar = el("selectOrdenacao").value || "risco_desc";
    const busca = el("inputBusca").value.trim();
    const setores = obterSetoresMarcados();
    return new URLSearchParams({
        modo: modoAtual,
        municipio,
        orgao,
        categoria,
        situacao,
        ordenar,
        busca,
        setores,
        pagina: String(paginaAtual),
        limite: "30",
    });
}
function renderizarBarraFiltrosAtivos(totalEncontrados) {
    const barra = el("barraFiltrosAtivos");
    const municipio = el("selectCidade").value || "TODAS";
    const orgao = el("selectOrgao").value || "TODOS";
    const categoria = el("selectCategoria").value || "TODAS";
    const situacao = el("selectSituacao").value || "todos";
    const busca = el("inputBusca").value.trim();
    const chips = [];
    if (municipio !== "TODAS") {
        chips.push({
            rotulo: `Município: ${municipio}`,
            acaoReset: async () => {
                el("selectCidade").value = "TODAS";
                await carregarOpcoesFiltro(true);
                await buscarProcessos(1, false);
            },
        });
    }
    if (orgao !== "TODOS") {
        chips.push({
            rotulo: `Órgão: ${orgao.length > 35 ? orgao.slice(0, 35) + "..." : orgao}`,
            acaoReset: () => {
                el("selectOrgao").value = "TODOS";
                buscarProcessos(1, false);
            },
        });
    }
    if (categoria !== "TODAS") {
        chips.push({
            rotulo: `Categoria: ${categoria}`,
            acaoReset: () => {
                el("selectCategoria").value = "TODAS";
                buscarProcessos(1, false);
            },
        });
    }
    if (situacao !== "todos") {
        const mapaSit = {
            risco: "Apenas Com Risco",
            critico: "Apenas Risco Crítico",
            normal: "Apenas Regulares",
        };
        chips.push({
            rotulo: `Situação: ${mapaSit[situacao] || situacao}`,
            acaoReset: () => {
                el("selectSituacao").value = "todos";
                buscarProcessos(1, false);
            },
        });
    }
    if (busca) {
        chips.push({
            rotulo: `Busca: "${busca}"`,
            acaoReset: () => {
                el("inputBusca").value = "";
                buscarProcessos(1, false);
            },
        });
    }
    if (chips.length === 0) {
        barra.classList.add("hidden");
        barra.classList.remove("flex");
        barra.innerHTML = "";
        return;
    }
    barra.classList.remove("hidden");
    barra.classList.add("flex");
    let html = `<span class="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1"><i class="fa-solid fa-filter-circle-xmark text-blue-600 mr-1"></i>Recorte Ativo (${formatarNumero(totalEncontrados)}):</span>`;
    chips.forEach((chip, idx) => {
        html += `
      <button
        type="button"
        data-chip-idx="${idx}"
        class="btn-remover-chip inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-xs font-semibold hover:bg-blue-100 transition-colors"
      >
        <span>${escaparHtml(chip.rotulo)}</span>
        <i class="fa-solid fa-xmark text-[10px] text-blue-600"></i>
      </button>
    `;
    });
    barra.innerHTML = html;
    barra.querySelectorAll(".btn-remover-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
            const idx = Number(btn.getAttribute("data-chip-idx"));
            if (chips[idx])
                chips[idx].acaoReset();
        });
    });
}
async function buscarProcessos(novaPagina = 1, manterSelecaoSePresente = false) {
    paginaAtual = novaPagina;
    const params = obterParametrosBuscaAtuais();
    const municipio = el("selectCidade").value || "TODAS";
    const resp = await fetch(`/api/processos?${params.toString()}`);
    const dados = await resp.json();
    const r = dados.resumo;
    renderizarBarraFiltrosAtivos(r.totalEncontrados);
    el("labelCidadeHeader").textContent =
        municipio === "TODAS" ? "MT, Brasil (141 Municípios)" : `${municipio}, MT`;
    el("badgeSidebarAlertas").textContent = formatarNumero(r.qtdComRisco);
    el("badgeHeaderCriticos").textContent = formatarNumero(r.qtdCriticos);
    el("kpiTotalProcessos").textContent = formatarNumero(r.totalEncontrados);
    el("kpiSubTotal").textContent =
        municipio === "TODAS" ? "Base PNCP-MT" : `Município: ${municipio}`;
    el("kpiComRisco").textContent = formatarNumero(r.qtdComRisco);
    el("kpiPctRisco").textContent = `${r.percentualComRisco.toFixed(1).replace(".", ",")}%`;
    el("kpiValorRisco").textContent = formatarMoedaCompacta(r.valorPotencialRisco);
    el("kpiSubCriticos").textContent = `${formatarNumero(r.qtdCriticos)} processos em prioridade crítica`;
    el("kpiEficienciaFiscal").textContent = `${r.eficienciaFiscal.toFixed(1).replace(".", ",")}%`;
    el("kpiSemRisco").textContent = `${formatarNumero(r.qtdSemRisco)} regulares`;
    // Card Flutuante do Mapa
    el("mapCardNomeCidade").textContent =
        municipio === "TODAS" ? "Mato Grosso (141 Cidades)" : municipio;
    if (municipio === "TODAS") {
        el("mapCardMicrorregiao").textContent = "Todas (22)";
    }
    else if (dadosMapaReal) {
        const mGeo = dadosMapaReal.municipios.find((x) => normalizarNomeCidade(x.nome) === normalizarNomeCidade(municipio));
        if (mGeo)
            el("mapCardMicrorregiao").textContent = mGeo.microrregiao;
    }
    el("mapCardTotalProc").textContent = formatarNumero(r.totalEncontrados);
    el("mapCardAlertas").textContent = formatarNumero(r.qtdComRisco);
    const elRiscoMedio = el("mapCardRiscoMedio");
    elRiscoMedio.textContent = `${r.riscoMedioPct.toFixed(1).replace(".", ",")}%`;
    if (r.riscoMedioPct >= 55) {
        elRiscoMedio.className = "px-2 py-0.5 rounded bg-red-100 text-red-700 font-bold font-mono";
    }
    else if (r.riscoMedioPct >= 30) {
        elRiscoMedio.className = "px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold font-mono";
    }
    else {
        elRiscoMedio.className = "px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold font-mono";
    }
    desenharCamadasMapaSvg();
    aplicarTransformacaoZoomMapa();
    // Paginação
    totalPaginasAtual = dados.paginacao.totalPaginas;
    paginaAtual = dados.paginacao.pagina;
    el("infoPaginacao").textContent = `Página ${paginaAtual} de ${totalPaginasAtual}`;
    el("btnPagAnterior").disabled = paginaAtual <= 1;
    el("btnPagProxima").disabled = paginaAtual >= totalPaginasAtual;
    const tbody = el("tabelaProcessosBody");
    const itens = dados.itens;
    if (itens.length === 0) {
        zerarSelecaoProcesso();
        tbody.innerHTML = `
      <tr>
        <td colspan="8" class="px-6 py-10 text-center text-slate-400">
          <i class="fa-solid fa-folder-open text-xl mb-2 block text-slate-300"></i>
          Nenhum processo encontrado para os filtros selecionados. Clique em "Limpar" no topo para restaurar.
        </td>
      </tr>
    `;
        return;
    }
    const idsNaPagina = itens.map((x) => x.id);
    if (!manterSelecaoSePresente || !idProcessoSelecionado || !idsNaPagina.includes(idProcessoSelecionado)) {
        zerarSelecaoProcesso();
    }
    let htmlLinhas = "";
    for (const item of itens) {
        const isSel = item.id === idProcessoSelecionado ? "selected-row" : "";
        let badgeProbClass = "bg-emerald-50 text-emerald-700 border border-emerald-200";
        let iconeRisco = `<i class="fa-solid fa-circle-check text-[10px] mr-1"></i>`;
        if (item.riscoPercentual >= 70) {
            badgeProbClass = "bg-red-50 text-red-700 border border-red-200";
            iconeRisco = `<i class="fa-solid fa-triangle-exclamation text-[10px] mr-1"></i>`;
        }
        else if (item.riscoPercentual >= 50) {
            badgeProbClass = "bg-amber-50 text-amber-800 border border-amber-200";
            iconeRisco = `<i class="fa-solid fa-circle-exclamation text-[10px] mr-1"></i>`;
        }
        htmlLinhas += `
      <tr data-id="${item.id}" class="hover:bg-slate-50 transition-colors cursor-pointer ${isSel}">
        <td class="px-5 py-3.5">
          <div class="font-bold font-mono text-xs text-slate-900">${escaparHtml(item.processo)}</div>
          <div class="text-[11px] text-slate-400 font-mono">${escaparHtml(item.idPncp)}</div>
        </td>
        <td class="px-4 py-3.5 text-slate-700 font-semibold text-xs whitespace-nowrap">${escaparHtml(item.municipio)}</td>
        <td class="px-4 py-3.5">
          <div class="text-xs font-bold text-slate-900 truncate max-w-[240px]" title="${escaparHtml(item.fornecedorNome)}">
            <i class="fa-solid fa-building text-teal-600 mr-1 text-[10px]"></i>${escaparHtml(item.fornecedorNome)}
          </div>
          <div class="text-[11px] text-slate-500 truncate max-w-[240px] mt-0.5" title="${escaparHtml(item.orgaoNome)}">
            <span class="font-mono text-slate-600">${escaparHtml(item.fornecedorDocFormatado)}</span> &bull; ${escaparHtml(item.orgaoNome)}
          </div>
        </td>
        <td class="px-4 py-3.5 text-slate-600 max-w-xs truncate text-xs" title="${escaparHtml(item.objetoResumido)}">
          ${escaparHtml(item.objetoResumido)}
        </td>
        <td class="px-4 py-3.5 text-right font-bold font-mono text-xs text-slate-900 whitespace-nowrap">
          ${formatarMoeda(item.valorGlobal)}
        </td>
        <td class="px-4 py-3.5 text-center whitespace-nowrap">
          <span class="inline-flex items-center px-2.5 py-1 rounded-full ${badgeProbClass} font-bold font-mono text-xs">
            ${iconeRisco}${item.riscoPercentual.toFixed(1)}%
          </span>
          <div class="text-[10px] font-semibold mt-1 ${item.isAnomalia ? "text-red-600" : "text-emerald-700"}">
            ${escaparHtml(item.motivoPrincipalCurto || (item.isAnomalia ? "Alerta de Anomalia" : "Dentro do padrão de MT"))}
          </div>
        </td>
        <td class="px-4 py-3.5 text-center text-slate-500 font-mono text-xs whitespace-nowrap">
          ${escaparHtml(item.dataAssinatura)}
        </td>
        <td class="px-4 py-3.5 text-center">
          <button type="button" data-btn-auditar="true" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-xs transition-colors">
            <i class="fa-solid fa-magnifying-glass-chart text-[10px]"></i> Auditar
          </button>
        </td>
      </tr>
    `;
    }
    tbody.innerHTML = htmlLinhas;
    tbody.querySelectorAll("tr[data-id]").forEach((tr) => {
        tr.addEventListener("click", async (ev) => {
            const idClicado = Number(tr.getAttribute("data-id"));
            if (idClicado) {
                idProcessoSelecionado = idClicado;
                tbody.querySelectorAll("tr").forEach((r) => r.classList.remove("selected-row"));
                tr.classList.add("selected-row");
                await carregarDetalhesProcesso(idClicado);
                const alvo = ev.target;
                if (alvo && alvo.closest("[data-btn-auditar]")) {
                    el("secao-dossie").scrollIntoView({ behavior: "smooth" });
                }
            }
        });
    });
    if (idProcessoSelecionado) {
        await carregarDetalhesProcesso(idProcessoSelecionado);
    }
}
// ============================================================================
// 4. VELOCÍMETRO PLOTLY E DOSSIÊ COMPLETO DO PROCESSO
// ============================================================================
function renderizarGaugeVazioPlotly() {
    try {
        const data = [
            {
                type: "indicator",
                mode: "gauge+number",
                value: 0,
                number: { suffix: "%", font: { size: 32, color: "#94a3b8", family: "JetBrains Mono" } },
                title: {
                    text: "Aguardando seleção de processo",
                    font: { size: 12, color: "#94a3b8", family: "Inter" },
                },
                gauge: {
                    axis: { range: [0, 100], tickwidth: 1, tickcolor: "#cbd5e1" },
                    bar: { color: "#cbd5e1", thickness: 0.32 },
                    bgcolor: "white",
                    borderwidth: 1,
                    bordercolor: "#e2e8f0",
                    steps: [
                        { range: [0, 50], color: "#f8fafc" },
                        { range: [50, 75], color: "#f1f5f9" },
                        { range: [75, 100], color: "#e2e8f0" },
                    ],
                },
            },
        ];
        const layout = {
            width: 310,
            height: 215,
            margin: { t: 35, b: 12, l: 25, r: 25 },
            paper_bgcolor: "rgba(0,0,0,0)",
            font: { color: "#64748b", family: "Inter" },
        };
        const config = { responsive: true, displayModeBar: false, displaylogo: false };
        Plotly.newPlot("risk-gauge", data, layout, config);
    }
    catch (err) {
        console.error("Erro ao zerar velocímetro Plotly:", err);
    }
}
function zerarSelecaoProcesso() {
    idProcessoSelecionado = null;
    processoDetalheAtual = null;
    document
        .querySelectorAll("#tabelaProcessosBody tr.selected-row")
        .forEach((r) => r.classList.remove("selected-row"));
    // Ocultar conteúdo ativo do Dossiê e exibir placeholder de "Nenhum processo selecionado"
    el("dossieVazioPlaceholder").classList.remove("hidden");
    el("dossieConteudoAtivo").classList.add("hidden");
    const botoesDossie = el("botoesAcaoDossie");
    botoesDossie.classList.add("hidden");
    botoesDossie.classList.remove("flex");
    // Resetar card do Termômetro de Anomalia (Velocímetro)
    renderizarGaugeVazioPlotly();
    const badgeGauge = el("gaugeBadgeStatus");
    badgeGauge.textContent = "AGUARDANDO SELEÇÃO";
    badgeGauge.className =
        "px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-200 text-slate-600 border border-slate-300 shrink-0";
    el("gaugeProcNumero").textContent = "Nenhum processo selecionado";
    el("gaugeProcSub").textContent = "Clique em uma linha da tabela abaixo para auditar";
    const nivelGauge = el("gaugeNivelTexto");
    nivelGauge.textContent = "—";
    nivelGauge.className = "font-bold text-[11px] text-slate-400";
    const listaIndicadoresEl = el("gaugeIndicadoresLista");
    listaIndicadoresEl.className =
        "space-y-2 text-xs text-slate-500 bg-slate-50/70 p-3 rounded-xl border border-slate-200/80 text-center py-4";
    listaIndicadoresEl.textContent =
        "Selecione um processo licitatório na tabela abaixo para exibir os indicadores de risco.";
    el("btnIrParaDossie").disabled = true;
}
function renderizarGaugePlotly(riscoPct, isAnomalia) {
    try {
        const corBarra = riscoPct >= 65 ? "#dc2626" : riscoPct >= 45 ? "#d97706" : "#059669";
        const data = [
            {
                type: "indicator",
                mode: "gauge+number",
                value: Number(riscoPct.toFixed(1)),
                number: { suffix: "%", font: { size: 34, color: "#0f172a", family: "JetBrains Mono" } },
                title: {
                    text: isAnomalia ? "Anomalia Estatística Detectada" : "Dentro do Padrão Histórico",
                    font: { size: 12, color: "#64748b", family: "Inter" },
                },
                gauge: {
                    axis: { range: [0, 100], tickwidth: 1, tickcolor: "#64748b" },
                    bar: { color: corBarra, thickness: 0.32 },
                    bgcolor: "white",
                    borderwidth: 1,
                    bordercolor: "#e2e8f0",
                    steps: [
                        { range: [0, 50], color: "#d1fae5" },
                        { range: [50, 75], color: "#fef3c7" },
                        { range: [75, 100], color: "#fee2e2" },
                    ],
                    threshold: {
                        line: { color: "#0f172a", width: 3 },
                        thickness: 0.75,
                        value: Number(riscoPct.toFixed(1)),
                    },
                },
            },
        ];
        const layout = {
            width: 310,
            height: 215,
            margin: { t: 35, b: 12, l: 25, r: 25 },
            paper_bgcolor: "rgba(0,0,0,0)",
            font: { color: "#334155", family: "Inter" },
        };
        const config = { responsive: true, displayModeBar: false, displaylogo: false };
        Plotly.newPlot("risk-gauge", data, layout, config);
    }
    catch (err) {
        console.error("Erro ao atualizar velocímetro Plotly:", err);
    }
}
function traduzirItemShapParaHumano(item, ctx, pesoPercentual) {
    const isAumentaRisco = item.impactoShap < 0;
    switch (item.codigo) {
        case "valor_aditivado": {
            const nomeHumano = "Diferença / Acréscimo de Valor (Aditivos)";
            const padraoMt = "R$ 0,00 (Sem acréscimo após a licitação)";
            let valorProcessoHumano = formatarMoeda(ctx.valorAditivado);
            if (ctx.valorInicial > 0 && ctx.valorAditivado > 0) {
                const pct = Math.round((ctx.valorAditivado / ctx.valorInicial) * 100);
                valorProcessoHumano = `${formatarMoeda(ctx.valorAditivado)} (+${pct}%)`;
            }
            if (isAumentaRisco) {
                if (ctx.valorInicial <= 0 && ctx.valorGlobal > 0) {
                    return {
                        nomeHumano,
                        valorProcessoHumano: `${formatarMoeda(ctx.valorAditivado)} (Valor Inicial R$ 0,00)`,
                        padraoMt,
                        significadoPratico: "O Valor Inicial foi cadastrado como R$ 0,00 no PNCP, gerando diferença igual ao total do contrato.",
                        fraseDetalhadaBullet: `<strong>Valor Inicial Zerado no Cadastro:</strong> O órgão informou o Valor Inicial Homologado como <strong>R$ 0,00</strong> e o Valor Global em <strong>${formatarMoeda(ctx.valorGlobal)}</strong>, gerando uma diferença contábil de <strong>${formatarMoeda(ctx.valorAditivado)}</strong> (inconsistência de preenchimento ou ausência do valor licitado).`,
                        pesoPercentual,
                        isAumentaRisco,
                    };
                }
                if (ctx.valorAditivado > 0 && ctx.valorInicial > 0) {
                    const pct = Math.round((ctx.valorAditivado / ctx.valorInicial) * 100);
                    return {
                        nomeHumano,
                        valorProcessoHumano,
                        padraoMt,
                        significadoPratico: `O contrato ficou +${pct}% (${formatarMoedaCompacta(ctx.valorAditivado)}) mais caro após a licitação.`,
                        fraseDetalhadaBullet: `<strong>Aumento de Valor Após a Licitação:</strong> O contrato começou em <strong>${formatarMoeda(ctx.valorInicial)}</strong>, mas sofreu acréscimos de <strong>${formatarMoeda(ctx.valorAditivado)} (+${pct}%)</strong>, subindo para <strong>${formatarMoeda(ctx.valorGlobal)}</strong>. Na maioria dos contratos de Mato Grosso, o valor final não sofre acréscimos.`,
                        pesoPercentual,
                        isAumentaRisco,
                    };
                }
                if (ctx.valorAditivado < 0) {
                    return {
                        nomeHumano,
                        valorProcessoHumano,
                        padraoMt,
                        significadoPratico: "O valor global atual sofreu redução atípica em relação ao valor inicial homologado.",
                        fraseDetalhadaBullet: `<strong>Redução/Supressão Atípica de Valor:</strong> O valor global atual (<strong>${formatarMoeda(ctx.valorGlobal)}</strong>) está <strong>${formatarMoeda(Math.abs(ctx.valorAditivado))} abaixo</strong> do valor inicial licitado (<strong>${formatarMoeda(ctx.valorInicial)}</strong>).`,
                        pesoPercentual,
                        isAumentaRisco,
                    };
                }
                return {
                    nomeHumano,
                    valorProcessoHumano,
                    padraoMt,
                    significadoPratico: "Diferença financeira atípica quando combinada ao porte do contrato.",
                    fraseDetalhadaBullet: `<strong>Diferença Financeira Atípica:</strong> A relação entre o valor inicial e o valor global final (${valorProcessoHumano}) destoou dos contratos similares.`,
                    pesoPercentual,
                    isAumentaRisco,
                };
            }
            else {
                return {
                    nomeHumano,
                    valorProcessoHumano,
                    padraoMt,
                    significadoPratico: "Sem aumento abusivo de valor após a licitação.",
                    fraseDetalhadaBullet: `<strong>Sem Acréscimos Suspeitos:</strong> O valor final do contrato manteve-se fiel ao valor inicial homologado (${formatarMoeda(ctx.valorGlobal)}), sem aditivos fora do padrão.`,
                    pesoPercentual,
                    isAumentaRisco,
                };
            }
        }
        case "numero_retificacao": {
            const nomeHumano = "Quantidade de Alterações (Aditivos)";
            const valorProcessoHumano = `${ctx.numeroRetificacoes} alteração(ões)`;
            const padraoMt = "0 alterações (Sem aditivos)";
            if (isAumentaRisco) {
                return {
                    nomeHumano,
                    valorProcessoHumano,
                    padraoMt,
                    significadoPratico: ctx.numeroRetificacoes > 0
                        ? `Contrato modificado ${ctx.numeroRetificacoes} vez(es) após assinado (acima do normal).`
                        : "Combinação atípica com os demais indicadores do contrato.",
                    fraseDetalhadaBullet: ctx.numeroRetificacoes > 0
                        ? `<strong>Excesso de Termos Aditivos / Retificações:</strong> Este contrato já foi modificado <strong>${ctx.numeroRetificacoes} vez(es)</strong> após a assinatura, enquanto mais de 90% dos contratos públicos de Mato Grosso possuem <strong>0 alterações</strong>.`
                        : `<strong>Histórico de Alterações:</strong> Embora registre 0 retificações, a combinação com o volume e prazo gerou alerta.`,
                    pesoPercentual,
                    isAumentaRisco,
                };
            }
            else {
                return {
                    nomeHumano,
                    valorProcessoHumano,
                    padraoMt,
                    significadoPratico: "Quantidade normal de alterações contratuais.",
                    fraseDetalhadaBullet: `<strong>Sem Excesso de Retificações:</strong> O contrato registra <strong>${ctx.numeroRetificacoes} alteração(ões)</strong>, dentro da normalidade estadual.`,
                    pesoPercentual,
                    isAumentaRisco,
                };
            }
        }
        case "tempo_vigencia_dias": {
            const nomeHumano = "Prazo de Duração do Contrato";
            const anos = (ctx.tempoVigenciaDias / 365).toFixed(1).replace(".", ",");
            const valorProcessoHumano = ctx.tempoVigenciaDias >= 0
                ? `${ctx.tempoVigenciaDias} dias (~${anos} anos)`
                : "Não informado / Inválido";
            const padraoMt = "Até 365 dias (1 ano)";
            if (isAumentaRisco) {
                if (ctx.tempoVigenciaDias <= 0) {
                    return {
                        nomeHumano,
                        valorProcessoHumano,
                        padraoMt,
                        significadoPratico: "Prazo de duração zerado, ausente ou com datas invertidas no PNCP.",
                        fraseDetalhadaBullet: `<strong>Prazo de Duração Inválido ou Ausente:</strong> A vigência registrada é de <strong>${ctx.tempoVigenciaDias} dias</strong>, indicando falha no cadastro das datas de início e fim do contrato.`,
                        pesoPercentual,
                        isAumentaRisco,
                    };
                }
                if (ctx.tempoVigenciaDias > 540) {
                    const mult = (ctx.tempoVigenciaDias / 365).toFixed(1).replace(".", ",");
                    return {
                        nomeHumano,
                        valorProcessoHumano,
                        padraoMt,
                        significadoPratico: `Duração ${mult}x maior que o prazo padrão de 1 ano (365 dias).`,
                        fraseDetalhadaBullet: `<strong>Prazo de Duração Muito Longo:</strong> O contrato tem vigência de <strong>${ctx.tempoVigenciaDias} dias (~${anos} anos)</strong>, cerca de <strong>${mult}x mais longo</strong> que o prazo padrão de <strong>365 dias (1 ano)</strong> praticado em Mato Grosso.`,
                        pesoPercentual,
                        isAumentaRisco,
                    };
                }
                return {
                    nomeHumano,
                    valorProcessoHumano,
                    padraoMt,
                    significadoPratico: `Prazo de ${ctx.tempoVigenciaDias} dias destoa dos contratos de mesmo porte.`,
                    fraseDetalhadaBullet: `<strong>Prazo de Execução Atípico:</strong> A vigência de <strong>${ctx.tempoVigenciaDias} dias</strong> fugiu do padrão esperado para contratos deste valor.`,
                    pesoPercentual,
                    isAumentaRisco,
                };
            }
            else {
                return {
                    nomeHumano,
                    valorProcessoHumano,
                    padraoMt,
                    significadoPratico: "Prazo de duração compatível com o padrão de 1 ano.",
                    fraseDetalhadaBullet: `<strong>Prazo de Duração Normal:</strong> A vigência de <strong>${ctx.tempoVigenciaDias} dias (~${anos} anos)</strong> está alinhada ao padrão das contratações públicas de Mato Grosso.`,
                    pesoPercentual,
                    isAumentaRisco,
                };
            }
        }
        case "log_valor_global": {
            const nomeHumano = "Valor Total do Contrato (R$)";
            const valorProcessoHumano = formatarMoeda(ctx.valorGlobal);
            const padraoMt = "Mediana: R$ 10,7 mil (Comum até R$ 1,5 Mi)";
            if (isAumentaRisco) {
                if (ctx.valorGlobal >= 1500000) {
                    const vezesMediana = Math.round(ctx.valorGlobal / 10722.5);
                    return {
                        nomeHumano,
                        valorProcessoHumano,
                        padraoMt,
                        significadoPratico: `Valor muito elevado (${formatarMoedaCompacta(ctx.valorGlobal)}), exigindo fiscalização especial.`,
                        fraseDetalhadaBullet: `<strong>Alto Volume Financeiro Envolvido:</strong> O valor global de <strong>${formatarMoeda(ctx.valorGlobal)}</strong> é cerca de <strong>${formatarNumero(vezesMediana)}x superior</strong> à mediana dos contratos de Mato Grosso (<strong>R$ 10.722,50</strong>), colocando-o na faixa de alto impacto orçamentário.`,
                        pesoPercentual,
                        isAumentaRisco,
                    };
                }
                return {
                    nomeHumano,
                    valorProcessoHumano,
                    padraoMt,
                    significadoPratico: "Valor total atípico quando cruzado com o prazo e parcelas.",
                    fraseDetalhadaBullet: `<strong>Valor Total Fora da Curva:</strong> O montante de <strong>${formatarMoeda(ctx.valorGlobal)}</strong> apresentou comportamento atípico na relação com as demais variáveis do contrato.`,
                    pesoPercentual,
                    isAumentaRisco,
                };
            }
            else {
                return {
                    nomeHumano,
                    valorProcessoHumano,
                    padraoMt,
                    significadoPratico: "Valor financeiro dentro da faixa habitual de contratações.",
                    fraseDetalhadaBullet: `<strong>Valor Total Compatível:</strong> O montante contratado de <strong>${formatarMoeda(ctx.valorGlobal)}</strong> encontra-se dentro da faixa histórica normal do estado.`,
                    pesoPercentual,
                    isAumentaRisco,
                };
            }
        }
        case "proporcao_parcela_global": {
            const nomeHumano = "Peso da Parcela sobre o Valor Total";
            const pctParc = (ctx.proporcaoParcelaGlobal * 100).toFixed(1).replace(".", ",");
            const valorProcessoHumano = `${pctParc}% do total (${formatarMoedaCompacta(ctx.valorParcela)})`;
            const padraoMt = "Entre 8% (mensal) e 100% (parcela única)";
            if (isAumentaRisco) {
                if (ctx.proporcaoParcelaGlobal > 1.02) {
                    return {
                        nomeHumano,
                        valorProcessoHumano,
                        padraoMt,
                        significadoPratico: `A parcela (${formatarMoedaCompacta(ctx.valorParcela)}) é MAIOR que o valor total do contrato (${pctParc}%).`,
                        fraseDetalhadaBullet: `<strong>Inconsistência Grave na Parcela:</strong> O valor informado para uma única parcela (<strong>${formatarMoeda(ctx.valorParcela)}</strong>) equivale a <strong>${pctParc}% do valor total do contrato</strong> (${formatarMoeda(ctx.valorGlobal)}), indicando erro de lançamento ou inversão de valores no PNCP.`,
                        pesoPercentual,
                        isAumentaRisco,
                    };
                }
                return {
                    nomeHumano,
                    valorProcessoHumano,
                    padraoMt,
                    significadoPratico: `Desembolso concentrado (${pctParc}% do contrato por parcela).`,
                    fraseDetalhadaBullet: `<strong>Concentração Financeira nas Parcelas:</strong> Cada parcela representa <strong>${pctParc}%</strong> (${formatarMoeda(ctx.valorParcela)}) do valor global do contrato, proporção incomum para um contrato com vigência de <strong>${ctx.tempoVigenciaDias} dias</strong>.`,
                    pesoPercentual,
                    isAumentaRisco,
                };
            }
            else {
                return {
                    nomeHumano,
                    valorProcessoHumano,
                    padraoMt,
                    significadoPratico: "Divisão de parcelas coerente com o valor total.",
                    fraseDetalhadaBullet: `<strong>Parcelamento Coerente:</strong> O valor da parcela (${formatarMoeda(ctx.valorParcela)}, ou ${pctParc}% do total) é compatível com o cronograma do contrato.`,
                    pesoPercentual,
                    isAumentaRisco,
                };
            }
        }
        default:
            return {
                nomeHumano: item.atributo,
                valorProcessoHumano: item.valorFormatado,
                padraoMt: "Padrão histórico PNCP-MT",
                significadoPratico: isAumentaRisco
                    ? "Valor fora do padrão esperado."
                    : "Valor dentro do padrão esperado.",
                fraseDetalhadaBullet: `<strong>${escaparHtml(item.atributo)}:</strong> Valor registrado de ${escaparHtml(item.valorFormatado)}.`,
                pesoPercentual,
                isAumentaRisco,
            };
    }
}
function calcularPesosPercentuaisShap(listaShap) {
    const somaAbs = listaShap.reduce((acc, s) => acc + Math.abs(s.impactoShap), 0) || 1;
    return listaShap.map((s) => Math.max(1, Math.round((Math.abs(s.impactoShap) / somaAbs) * 100)));
}
async function carregarDetalhesProcesso(id) {
    const resp = await fetch(`/api/processos/${id}?modo=${modoAtual}`);
    if (!resp.ok)
        return;
    const dados = await resp.json();
    const proc = dados.processo;
    const hist = dados.historicoFornecedor;
    processoDetalheAtual = proc;
    // Exibir o conteúdo ativo do Dossiê e ocultar o placeholder de estado vazio
    el("dossieVazioPlaceholder").classList.add("hidden");
    el("dossieConteudoAtivo").classList.remove("hidden");
    const botoesDossie = el("botoesAcaoDossie");
    botoesDossie.classList.remove("hidden");
    botoesDossie.classList.add("flex");
    el("btnIrParaDossie").disabled = false;
    const resModo = proc[modoAtual];
    const pesosShap = calcularPesosPercentuaisShap(resModo.shap);
    const traducoes = resModo.shap.map((s, idx) => traduzirItemShapParaHumano(s, proc, pesosShap[idx]));
    renderizarGaugePlotly(resModo.riscoPercentual, resModo.isAnomalia);
    const badgeGauge = el("gaugeBadgeStatus");
    const nivelGauge = el("gaugeNivelTexto");
    if (resModo.isAnomalia) {
        badgeGauge.textContent = resModo.nivel === "alta" ? "PRIORIDADE CRÍTICA" : "ALERTA DE RISCO";
        badgeGauge.className =
            "px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-700 border border-red-200 shrink-0";
        nivelGauge.textContent = "COM ALERTA";
        nivelGauge.className = "font-bold text-[11px] text-red-600";
    }
    else {
        badgeGauge.textContent = "SEM RISCO";
        badgeGauge.className =
            "px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 shrink-0";
        nivelGauge.textContent = "REGULAR";
        nivelGauge.className = "font-bold text-[11px] text-emerald-600";
    }
    el("gaugeProcNumero").textContent = `Proc. ${proc.processo || proc.idPncp}`;
    el("gaugeProcSub").textContent = `${proc.categoria} — ${proc.municipio} (${formatarMoedaCompacta(proc.valorGlobal)})`;
    // Sugestão 3: No Velocímetro, mostrar nome humano, valor claro e % de peso na decisão (sem SHAP negativo confuso)
    const listaIndicadoresEl = el("gaugeIndicadoresLista");
    listaIndicadoresEl.className =
        "space-y-1.5 text-xs bg-slate-50/70 p-3 rounded-xl border border-slate-200/80";
    let htmlInd = "";
    for (const t of traducoes.slice(0, 3)) {
        const corBola = t.isAumentaRisco ? "bg-red-500" : "bg-emerald-500";
        const badgeEfeito = t.isAumentaRisco
            ? `<span class="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold text-[10px] shrink-0">Agrava (${t.pesoPercentual}%)</span>`
            : `<span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px] shrink-0">Normal</span>`;
        htmlInd += `
      <div class="flex flex-col gap-0.5 py-1 border-b border-slate-200/60 last:border-none">
        <div class="flex items-center justify-between gap-2">
          <span class="flex items-center gap-1.5 truncate font-semibold text-slate-800">
            <span class="w-2 h-2 rounded-full ${corBola} shrink-0"></span>
            <span class="truncate">${escaparHtml(t.nomeHumano)}</span>
          </span>
          ${badgeEfeito}
        </div>
        <div class="text-[11px] text-slate-500 pl-3.5 truncate">
          Valor: <strong class="font-mono text-slate-700">${escaparHtml(t.valorProcessoHumano)}</strong>
        </div>
      </div>
    `;
    }
    listaIndicadoresEl.innerHTML = htmlInd;
    el("detOrgaoNome").textContent = proc.orgaoNome || "Não informado";
    el("detUnidadeNome").textContent = proc.unidadeNome || "Não informada";
    el("detOrgaoCnpj").textContent = proc.orgaoCnpjFormatado || "Não informado";
    el("detMunicipio").textContent = `${proc.municipio} - MT`;
    const esferaStr = MAPA_ESFERA[proc.esferaId] || proc.esferaId || "N/I";
    const poderStr = MAPA_PODER[proc.poderId] || proc.poderId || "N/I";
    el("detEsferaPoder").textContent = `${esferaStr} / ${poderStr}`;
    el("detFornecedorNome").textContent = proc.fornecedorNome || "Não informado";
    el("detFornecedorDoc").textContent = proc.fornecedorDocFormatado || "Não informado";
    el("detTipoPessoa").textContent =
        proc.tipoPessoa === "PJ"
            ? "Pessoa Jurídica (PJ)"
            : proc.tipoPessoa === "PF"
                ? "Pessoa Física (PF)"
                : proc.tipoPessoa;
    el("detHistQtd").textContent = `${hist.totalContratosEstado} contrato(s) (${formatarMoedaCompacta(hist.valorTotalEstado)})`;
    const elHistRisco = el("detHistRisco");
    if (hist.contratosComRiscoEstado > 0) {
        elHistRisco.innerHTML = `<span class="text-red-600 font-mono"><i class="fa-solid fa-triangle-exclamation mr-1"></i>${hist.contratosComRiscoEstado} de ${hist.totalContratosEstado} com alerta</span>`;
    }
    else {
        elHistRisco.innerHTML = `<span class="text-emerald-700 font-mono"><i class="fa-solid fa-circle-check mr-1"></i>0 alertas em ${hist.totalContratosEstado} contrato(s)</span>`;
    }
    el("detNumeroProcesso").textContent = `Processo nº ${proc.processo || "Não informado"}`;
    el("detIdPncp").textContent = proc.idPncp;
    el("detEmpenhoTipo").textContent = `${proc.empenho || "S/N"} (${proc.tipoContrato || "Contrato"})`;
    el("detCategoria").textContent = proc.categoria || "Não informada";
    const anosVig = (proc.tempoVigenciaDias / 365).toFixed(1);
    el("detDatasVigencia").textContent = `${proc.dataAssinatura} | ${proc.tempoVigenciaDias}d (~${anosVig}a)`;
    el("detObjetoCompleto").textContent = proc.objeto || "Não informado";
    const banner = el("bannerVeredito");
    const barra = el("barraMedidorRisco");
    const fatoresRisco = traducoes.filter((t) => t.isAumentaRisco);
    if (resModo.isAnomalia) {
        banner.className =
            "rounded-2xl p-5 sm:p-6 border-2 border-l-8 bg-red-50/70 border-red-200 border-l-red-600";
        el("vereditoTitulo").innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1.5"></i>SIM — PROCESSO COM ALERTA DE ANOMALIA (${resModo.riscoPercentual.toFixed(1)}%)`;
        el("vereditoTitulo").className = "text-lg sm:text-xl font-extrabold text-red-700 mt-0.5";
        barra.className = "h-full rounded-full transition-all duration-300 bg-red-600";
        el("vereditoPercentual").className = "text-2xl font-extrabold font-mono text-red-600";
        const resumoMotivos = fatoresRisco.length > 0
            ? fatoresRisco.map((f) => f.significadoPratico).join(" Além disso, ")
            : resModo.recomendacao;
        el("vereditoRecomendacao").innerHTML = `<strong>Resumo em linguagem simples:</strong> ${escaparHtml(resumoMotivos)} Recomenda-se verificar a documentação comprobatória e justificativas deste contrato.`;
    }
    else {
        banner.className =
            "rounded-2xl p-5 sm:p-6 border-2 border-l-8 bg-emerald-50/70 border-emerald-200 border-l-emerald-600";
        el("vereditoTitulo").innerHTML = `<i class="fa-solid fa-circle-check mr-1.5"></i>NÃO — PROCESSO REGULAR / SEM INDÍCIO DE ANOMALIA (${resModo.riscoPercentual.toFixed(1)}%)`;
        el("vereditoTitulo").className = "text-lg sm:text-xl font-extrabold text-emerald-700 mt-0.5";
        barra.className = "h-full rounded-full transition-all duration-300 bg-emerald-600";
        el("vereditoPercentual").className = "text-2xl font-extrabold font-mono text-emerald-700";
        el("vereditoRecomendacao").innerHTML = `<strong>Resumo em linguagem simples:</strong> Os valores, o prazo de duração (${proc.tempoVigenciaDias} dias) e a quantidade de alterações (${proc.numeroRetificacoes}) deste contrato estão dentro do padrão normal praticado pelos órgãos públicos de Mato Grosso.`;
    }
    el("vereditoFaixa").textContent = `Nível de Prioridade: ${resModo.faixaPrioridade} (Posição #${formatarNumero(resModo.posicaoRanking)} entre os 9.021 contratos de MT)`;
    el("vereditoPercentual").textContent = `${resModo.riscoPercentual.toFixed(1)}%`;
    el("vereditoRanking").textContent = `Ranking #${formatarNumero(resModo.posicaoRanking)} de 9.021`;
    barra.style.width = `${Math.min(100, Math.max(3, resModo.riscoPercentual))}%`;
    el("metValorInicial").textContent = formatarMoeda(proc.valorInicial);
    el("metValorGlobal").textContent = formatarMoeda(proc.valorGlobal);
    el("metValorAditivado").textContent = formatarMoeda(proc.valorAditivado);
    const pctParc = (proc.proporcaoParcelaGlobal * 100).toFixed(1);
    el("metValorParcela").textContent = `${formatarMoedaCompacta(proc.valorParcela)} (${pctParc}%)`;
    el("metVigencia").textContent = `${proc.tempoVigenciaDias} dias (~${anosVig}a)`;
    el("metRetificacoes").textContent = `${proc.numeroRetificacoes} aditivo(s)`;
    renderizarShapHumanizado(resModo.shap, resModo.isAnomalia, proc);
    el("compModoAuditoria").innerHTML = proc.auditoria.isAnomalia
        ? `<span class="text-red-600 font-bold"><i class="fa-solid fa-triangle-exclamation mr-1"></i>COM ALERTA DE RISCO (${proc.auditoria.riscoPercentual.toFixed(1)}%)</span>`
        : `<span class="text-emerald-700 font-bold"><i class="fa-solid fa-circle-check mr-1"></i>REGULAR / SEM RISCO (${proc.auditoria.riscoPercentual.toFixed(1)}%)</span>`;
    el("compModoPreventivo").innerHTML = proc.preventivo.isAnomalia
        ? `<span class="text-red-600 font-bold"><i class="fa-solid fa-triangle-exclamation mr-1"></i>COM ALERTA DE RISCO (${proc.preventivo.riscoPercentual.toFixed(1)}%)</span>`
        : `<span class="text-emerald-700 font-bold"><i class="fa-solid fa-circle-check mr-1"></i>REGULAR / SEM RISCO (${proc.preventivo.riscoPercentual.toFixed(1)}%)</span>`;
}
function renderizarShapHumanizado(listaShap, isAnomalia, ctx) {
    const destaqueBox = el("destaqueMotivoPrincipal");
    const tbodyShap = el("tabelaShapBody");
    const graficoContainer = el("graficoShapBarras");
    if (!listaShap || listaShap.length === 0) {
        destaqueBox.textContent = "Sem dados de diagnóstico disponíveis.";
        tbodyShap.innerHTML = "";
        graficoContainer.innerHTML = "";
        return;
    }
    const pesos = calcularPesosPercentuaisShap(listaShap);
    const traducoes = listaShap.map((item, idx) => traduzirItemShapParaHumano(item, ctx, pesos[idx]));
    const fatoresQueAgravam = traducoes.filter((t) => t.isAumentaRisco);
    const fatoresNormais = traducoes.filter((t) => !t.isAumentaRisco);
    // Sugestões 1 e 2: Caixa de Explicação em Linguagem Natural (tanto para Com Risco quanto para Regular)
    if (isAnomalia && fatoresQueAgravam.length > 0) {
        destaqueBox.className =
            "p-4 rounded-xl bg-red-50/90 border-l-4 border-red-600 text-xs sm:text-sm text-slate-800 space-y-2";
        let htmlBullets = `
      <div class="font-extrabold text-red-800 text-sm flex items-center gap-2">
        <i class="fa-solid fa-circle-exclamation text-red-600"></i>
        <span>Por que este processo recebeu Alerta de Anomalia? (${fatoresQueAgravam.length} fator(es) fora do padrão):</span>
      </div>
      <ul class="list-disc pl-5 space-y-1.5 text-slate-800 leading-relaxed">
    `;
        for (const f of fatoresQueAgravam) {
            htmlBullets += `<li>${f.fraseDetalhadaBullet} <span class="inline-block ml-1 px-2 py-0.5 rounded bg-red-100 text-red-700 font-mono font-bold text-[11px]">Peso: ${f.pesoPercentual}% da decisão</span></li>`;
        }
        htmlBullets += `</ul>`;
        if (fatoresNormais.length > 0) {
            htmlBullets += `
        <div class="pt-2 border-t border-red-200/70 text-xs text-slate-600">
          <i class="fa-solid fa-circle-check text-emerald-600 mr-1"></i>
          <strong>Pontos que estão normais neste processo:</strong> ${fatoresNormais
                .map((f) => f.nomeHumano)
                .join(", ")}.
        </div>
      `;
        }
        destaqueBox.innerHTML = htmlBullets;
    }
    else {
        destaqueBox.className =
            "p-4 rounded-xl bg-emerald-50/90 border-l-4 border-emerald-600 text-xs sm:text-sm text-slate-800 space-y-2";
        let htmlBullets = `
      <div class="font-extrabold text-emerald-800 text-sm flex items-center gap-2">
        <i class="fa-solid fa-shield-check text-emerald-600"></i>
        <span>Por que este processo foi considerado REGULAR (Sem Indício de Fraude)?</span>
      </div>
      <ul class="list-disc pl-5 space-y-1.5 text-slate-800 leading-relaxed">
    `;
        for (const f of traducoes) {
            htmlBullets += `<li>${f.fraseDetalhadaBullet}</li>`;
        }
        htmlBullets += `</ul>`;
        destaqueBox.innerHTML = htmlBullets;
    }
    // Sugestão 4: Tabela Comparativa de 5 Colunas (Processo vs Padrão de Mato Grosso)
    let htmlTab = "";
    let htmlBarras = "";
    let maxPeso = 1;
    for (const p of pesos) {
        if (p > maxPeso)
            maxPeso = p;
    }
    traducoes.forEach((t, idx) => {
        const rawShap = listaShap[idx].impactoShap;
        const sinal = rawShap >= 0 ? "+" : "";
        const badgeImpacto = t.isAumentaRisco
            ? `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 font-bold text-xs">
           <i class="fa-solid fa-arrow-trend-up text-[10px]"></i> Aumenta Risco (${t.pesoPercentual}%)
         </span>`
            : `<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs">
           <i class="fa-solid fa-circle-check text-[10px]"></i> Padrão Normal (${t.pesoPercentual}%)
         </span>`;
        htmlTab += `
      <tr class="hover:bg-slate-50/80">
        <td class="py-3 px-4 font-bold text-slate-900">${escaparHtml(t.nomeHumano)}</td>
        <td class="py-3 px-4 font-mono font-bold text-slate-800">${escaparHtml(t.valorProcessoHumano)}</td>
        <td class="py-3 px-4 text-slate-500 font-medium">${escaparHtml(t.padraoMt)}</td>
        <td class="py-3 px-4 text-slate-700">${escaparHtml(t.significadoPratico)}</td>
        <td class="py-3 px-4 text-right whitespace-nowrap">
          ${badgeImpacto}
          <div class="text-[10px] font-mono text-slate-400 mt-0.5" title="Valor matemático bruto do modelo TreeSHAP">
            Índice técnico SHAP: ${sinal}${rawShap.toFixed(3)}
          </div>
        </td>
      </tr>
    `;
        const larguraPct = Math.min(100, Math.max(8, (t.pesoPercentual / maxPeso) * 100));
        const corBarra = t.isAumentaRisco ? "#dc2626" : "#059669";
        const textoEfeitoBarra = t.isAumentaRisco
            ? `<span class="text-red-600 font-bold"><i class="fa-solid fa-triangle-exclamation mr-1"></i>Aumentou a suspeita (${t.pesoPercentual}% do peso)</span>`
            : `<span class="text-emerald-700 font-bold"><i class="fa-solid fa-circle-check mr-1"></i>Reduziu a suspeita / Normal (${t.pesoPercentual}% do peso)</span>`;
        htmlBarras += `
      <div class="shap-bar-row">
        <div class="shap-bar-label">
          <span class="text-slate-800 font-bold">${escaparHtml(t.nomeHumano)}: <span class="text-slate-500 font-mono font-semibold">${escaparHtml(t.valorProcessoHumano)}</span></span>
          ${textoEfeitoBarra}
        </div>
        <div class="shap-bar-track">
          <div class="shap-bar-fill" style="width:${larguraPct.toFixed(1)}%; background-color:${corBarra};"></div>
        </div>
        <div class="text-[11px] text-slate-500">${escaparHtml(t.significadoPratico)}</div>
      </div>
    `;
    });
    tbodyShap.innerHTML = htmlTab;
    graficoContainer.innerHTML = htmlBarras;
}
// ============================================================================
// 5. PAINEL DE EMPRESAS, EXPORTAÇÃO CSV/TXT/PDF E SIMULADOR
// ============================================================================
async function carregarPainelEmpresas() {
    const municipio = el("selectCidade").value || "TODAS";
    const busca = el("inputBusca").value.trim();
    const resp = await fetch(`/api/empresas?modo=${modoAtual}&municipio=${encodeURIComponent(municipio)}&busca=${encodeURIComponent(busca)}`);
    const dados = await resp.json();
    const lista = dados.itens;
    const tbody = el("tabelaEmpresasBody");
    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="px-5 py-6 text-center text-slate-400">Nenhuma empresa encontrada.</td></tr>`;
        return;
    }
    let html = "";
    for (const emp of lista) {
        const badgeRisco = emp.qtdComRisco > 0
            ? `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 font-bold font-mono text-xs"><i class="fa-solid fa-triangle-exclamation text-[10px]"></i>${emp.qtdComRisco} alerta(s)</span>`
            : `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold font-mono text-xs"><i class="fa-solid fa-circle-check text-[10px]"></i>0 alertas</span>`;
        html += `
      <tr class="hover:bg-slate-50 transition-colors">
        <td class="px-5 py-3 font-bold text-slate-800 text-xs">${escaparHtml(emp.fornecedorNome)}</td>
        <td class="px-4 py-3 font-mono text-xs text-slate-600">${escaparHtml(emp.fornecedorDocFormatado)}</td>
        <td class="px-4 py-3 text-center font-semibold font-mono text-xs">${emp.totalProcessos}</td>
        <td class="px-4 py-3 text-center">${badgeRisco}</td>
        <td class="px-4 py-3 text-center font-bold font-mono text-xs ${emp.maiorRiscoPct >= 55 ? "text-red-600" : "text-emerald-700"}">${emp.maiorRiscoPct.toFixed(1)}%</td>
        <td class="px-4 py-3 text-right font-bold font-mono text-xs text-slate-900">${formatarMoeda(emp.valorTotalContratado)}</td>
        <td class="px-5 py-3 text-center">
          <button
            type="button"
            data-cnpj="${escaparHtml(emp.fornecedorDocFormatado)}"
            class="btn-ver-empresa inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold text-xs transition-colors"
          >
            <i class="fa-solid fa-filter text-[10px]"></i> Auditar Contratos
          </button>
        </td>
      </tr>
    `;
    }
    tbody.innerHTML = html;
    tbody.querySelectorAll(".btn-ver-empresa").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const cnpj = btn.getAttribute("data-cnpj") || "";
            el("inputBusca").value = cnpj;
            await buscarProcessos(1, false);
            el("secao-licitacoes").scrollIntoView({ behavior: "smooth" });
        });
    });
}
function exportarTabelaCsv() {
    const params = obterParametrosBuscaAtuais();
    const url = `/api/exportar-csv?${params.toString()}`;
    const a = document.createElement("a");
    a.href = url;
    a.download = `licitwatch_mt_auditoria_${modoAtual}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    mostrarToast("Exportando planilha CSV dos processos filtrados...");
}
function baixarFichaTxt() {
    if (!processoDetalheAtual) {
        mostrarToast("Selecione um processo na tabela antes de baixar o dossiê.");
        return;
    }
    const p = processoDetalheAtual;
    const m = p[modoAtual];
    const pesos = calcularPesosPercentuaisShap(m.shap);
    const traducoes = m.shap.map((s, idx) => traduzirItemShapParaHumano(s, p, pesos[idx]));
    let conteudo = `================================================================================
LICITWATCH MT — DOSSIÊ DE AUDITORIA DE PROCESSO LICITATÓRIO (PNCP)
================================================================================
PARECER          : ${m.isAnomalia ? "COM ALERTA DE RISCO" : "REGULAR (DENTRO DO PADRÃO)"}
PROBABILIDADE IA : ${m.riscoPercentual.toFixed(1)}% — ${m.faixaPrioridade}
SCORE ALGORÍTMICO: ${m.scoreAnomalia.toFixed(6)} (Posição #${m.posicaoRanking} de 9.021 em MT)
MODO DO MODELO   : ${modoAtual === "auditoria" ? "Auditoria Completa (Etapa 10)" : "Alerta na Assinatura (Etapa 24)"}
--------------------------------------------------------------------------------
IDENTIFICAÇÃO DAS PARTES:
Órgão Contratante : ${p.orgaoNome} (${p.municipio} - MT)
CNPJ do Órgão     : ${p.orgaoCnpjFormatado} | Unidade: ${p.unidadeNome}
Empresa Contratada: ${p.fornecedorNome}
CNPJ / CPF Forn.  : ${p.fornecedorDocFormatado} (${p.tipoPessoa})
--------------------------------------------------------------------------------
DADOS FORMAIS E EXECUÇÃO FINANCEIRA:
Nº do Processo    : ${p.processo}
ID Controle PNCP  : ${p.idPncp}
Contrato/Empenho  : ${p.empenho} (${p.tipoContrato}) | Categoria: ${p.categoria}
Vigência          : ${p.dataVigenciaInicio} a ${p.dataVigenciaFim} (${p.tempoVigenciaDias} dias)
Valor Inicial     : ${formatarMoeda(p.valorInicial)}
Valor Global      : ${formatarMoeda(p.valorGlobal)}
Valor Aditivado   : ${formatarMoeda(p.valorAditivado)}
Valor da Parcela  : ${formatarMoeda(p.valorParcela)}
Retificações      : ${p.numeroRetificacoes}
Objeto            : ${p.objeto}
--------------------------------------------------------------------------------
EXPLICAÇÃO EM LINGUAGEM SIMPLES (COMPARATIVO COM O PADRÃO DE MATO GROSSO):
`;
    for (const t of traducoes) {
        const efeitoStr = t.isAumentaRisco
            ? `[AUMENTA RISCO - Peso: ${t.pesoPercentual}%]`
            : `[NORMAL / REDUZ RISCO - Peso: ${t.pesoPercentual}%]`;
        conteudo += `  * ${t.nomeHumano}: ${t.valorProcessoHumano} (Padrão MT: ${t.padraoMt})\n`;
        conteudo += `    -> ${efeitoStr} ${t.significadoPratico}\n`;
    }
    conteudo += `================================================================================\n`;
    const blob = new Blob([conteudo], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dossie_licitwatch_${p.idPncp.replace(/[^a-zA-Z0-9_-]/g, "_")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    mostrarToast("Dossiê individual (.TXT) exportado com sucesso!");
}
async function executarSimulacaoManual() {
    const btn = el("btnExecutarSimulacao");
    const box = el("resultadoSimulacaoBox");
    const vInicial = Number(el("simValorInicial").value || 0);
    const vGlobal = Number(el("simValorGlobal").value || 0);
    const vParcela = Number(el("simValorParcela").value || 0);
    const vigDias = Number(el("simVigenciaDias").value || 365);
    const nRetif = Number(el("simRetificacoes").value || 0);
    const payload = {
        modo: modoAtual,
        valorInicial: vInicial,
        valorGlobal: vGlobal,
        valorParcela: vParcela,
        tempoVigenciaDias: vigDias,
        numeroRetificacoes: nRetif,
    };
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Calculando...</span>`;
    box.classList.remove("hidden");
    box.className = "mt-4 p-4 rounded-xl text-sm bg-slate-100 text-slate-700";
    box.textContent = "Analisando contrato simulado e comparando com os 9.021 processos de Mato Grosso...";
    try {
        const resp = await fetch("/api/simular", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const res = await resp.json();
        if (res.erro) {
            box.className = "mt-4 p-4 rounded-xl text-sm bg-red-50 border border-red-200 text-red-700";
            box.innerHTML = `<strong>Erro na simulação:</strong> ${escaparHtml(res.erro)}`;
        }
        else {
            const ctxSim = {
                valorInicial: vInicial,
                valorGlobal: vGlobal,
                valorParcela: vParcela,
                valorAditivado: vGlobal - vInicial,
                proporcaoParcelaGlobal: vGlobal > 0 ? vParcela / vGlobal : 0,
                tempoVigenciaDias: vigDias,
                numeroRetificacoes: nRetif,
            };
            const listaShapSim = res.shap || [];
            const pesosSim = calcularPesosPercentuaisShap(listaShapSim);
            const traducoesSim = listaShapSim.map((s, idx) => traduzirItemShapParaHumano(s, ctxSim, pesosSim[idx]));
            if (res.isAnomalia) {
                const motivosRisco = traducoesSim.filter((t) => t.isAumentaRisco);
                box.className = "mt-4 p-4 rounded-xl text-sm bg-red-50 border border-red-200 text-red-900 space-y-2";
                box.innerHTML = `
          <div class="font-extrabold text-red-700 text-base flex items-center gap-2">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>ALERTA DE ANOMALIA DETECTADO (${res.riscoPercentual.toFixed(1)}% de Risco)</span>
          </div>
          <div class="text-xs font-semibold text-slate-700">
            Classificação: ${escaparHtml(res.faixaPrioridade)}
          </div>
          <div class="pt-1 text-xs space-y-1">
            <strong class="text-red-800 block">Por que este contrato simulado gerou alerta?</strong>
            <ul class="list-disc pl-5 space-y-1 text-slate-800">
              ${motivosRisco
                    .map((m) => `<li>${m.fraseDetalhadaBullet} <span class="font-mono font-bold text-red-700">(Peso: ${m.pesoPercentual}%)</span></li>`)
                    .join("")}
            </ul>
          </div>
        `;
            }
            else {
                box.className =
                    "mt-4 p-4 rounded-xl text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2";
                box.innerHTML = `
          <div class="font-extrabold text-emerald-700 text-base flex items-center gap-2">
            <i class="fa-solid fa-circle-check"></i>
            <span>CONTRATO SIMULADO DENTRO DO PADRÃO (${res.riscoPercentual.toFixed(1)}% — Sem Indício de Anomalia)</span>
          </div>
          <div class="text-xs text-slate-700">
            Os valores, o prazo de duração (${vigDias} dias) e os aditivos informados são compatíveis com o histórico de contratações públicas de Mato Grosso.
          </div>
        `;
            }
        }
    }
    catch (e) {
        box.className = "mt-4 p-4 rounded-xl text-sm bg-red-50 text-red-700";
        box.textContent = `Falha na conexão: ${String(e)}`;
    }
    finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-bolt"></i> <span>Calcular Risco</span>`;
    }
}
function ativarItemMenuSidebar(idAtivo) {
    document.querySelectorAll("#sidebar .nav-item").forEach((a) => {
        a.classList.remove("bg-blue-700", "text-white");
        a.classList.add("text-slate-300");
    });
    const alvo = document.getElementById(idAtivo);
    if (alvo) {
        alvo.classList.add("bg-blue-700", "text-white");
        alvo.classList.remove("text-slate-300");
    }
    fecharSidebarMobile();
}
function abrirSidebarMobile() {
    el("sidebar").classList.remove("hidden");
    el("backdropSidebar").classList.remove("hidden");
}
function fecharSidebarMobile() {
    if (window.innerWidth < 768) {
        el("sidebar").classList.add("hidden");
        el("backdropSidebar").classList.add("hidden");
    }
}
document.addEventListener("DOMContentLoaded", async () => {
    await inicializarMapaRealIbge();
    await carregarOpcoesFiltro(false);
    await buscarProcessos(1, false);
    // Mobile Sidebar
    el("btnMenuMobile").addEventListener("click", abrirSidebarMobile);
    el("btnFecharSidebarMobile").addEventListener("click", fecharSidebarMobile);
    el("backdropSidebar").addEventListener("click", fecharSidebarMobile);
    // Gaveta de Índice Numérico (1 a 141) no Mapa
    const painelIndice = el("painelIndiceMapa");
    el("btnToggleIndiceMapa").addEventListener("click", () => {
        painelIndice.classList.toggle("hidden");
    });
    el("btnFecharIndiceMapa").addEventListener("click", () => {
        painelIndice.classList.add("hidden");
    });
    el("inputBuscaIndiceMapa").addEventListener("input", () => {
        renderizarListaIndiceMunicipios();
    });
    // Controles de Cor do Mapa (Por Risco vs Por Microrregião) e Exibição de Nomes
    const btnCorRisco = el("btnCorRisco");
    const btnCorMicro = el("btnCorMicrorregiao");
    btnCorRisco.addEventListener("click", () => {
        modoCorMapa = "risco";
        btnCorRisco.className =
            "px-2.5 py-1 rounded-md font-semibold bg-blue-600 text-white transition-all flex items-center gap-1.5";
        btnCorMicro.className =
            "px-2.5 py-1 rounded-md font-medium text-slate-600 hover:bg-slate-100 transition-all flex items-center gap-1.5";
        atualizarLegendaMapa();
        desenharCamadasMapaSvg();
        aplicarTransformacaoZoomMapa();
    });
    btnCorMicro.addEventListener("click", () => {
        modoCorMapa = "microrregiao";
        btnCorMicro.className =
            "px-2.5 py-1 rounded-md font-semibold bg-blue-600 text-white transition-all flex items-center gap-1.5";
        btnCorRisco.className =
            "px-2.5 py-1 rounded-md font-medium text-slate-600 hover:bg-slate-100 transition-all flex items-center gap-1.5";
        atualizarLegendaMapa();
        desenharCamadasMapaSvg();
        aplicarTransformacaoZoomMapa();
    });
    el("chkMostrarTodosNomes").addEventListener("change", (ev) => {
        mostrarNomesCidades = ev.target.checked;
        desenharCamadasMapaSvg();
        aplicarTransformacaoZoomMapa();
    });
    // Filtros Principais e Ordenação
    el("selectCidade").addEventListener("change", async () => {
        el("selectOrgao").value = "TODOS";
        await carregarOpcoesFiltro(true);
        await buscarProcessos(1, false);
    });
    el("selectOrgao").addEventListener("change", () => buscarProcessos(1, false));
    el("selectCategoria").addEventListener("change", () => buscarProcessos(1, false));
    el("selectSituacao").addEventListener("change", () => buscarProcessos(1, false));
    el("selectOrdenacao").addEventListener("change", () => buscarProcessos(1, false));
    ["chkSetorSaude", "chkSetorEducacao", "chkSetorInfra"].forEach((idChk) => {
        el(idChk).addEventListener("change", () => buscarProcessos(1, false));
    });
    // Busca Global
    el("inputBusca").addEventListener("input", () => {
        if (debounceTimer)
            window.clearTimeout(debounceTimer);
        debounceTimer = window.setTimeout(() => {
            buscarProcessos(1, false);
        }, 240);
    });
    const resetarTudo = async () => {
        zerarSelecaoProcesso();
        el("selectCidade").value = "TODAS";
        el("selectOrgao").value = "TODOS";
        el("selectCategoria").value = "TODAS";
        el("selectSituacao").value = "todos";
        el("selectOrdenacao").value = "risco_desc";
        el("inputBusca").value = "";
        el("chkSetorSaude").checked = true;
        el("chkSetorEducacao").checked = true;
        el("chkSetorInfra").checked = true;
        zoomScale = 1.0;
        panX = 0;
        panY = 0;
        await carregarOpcoesFiltro(false);
        await buscarProcessos(1, false);
    };
    el("btnLimparFiltros").addEventListener("click", resetarTudo);
    el("btnSincronizarPncp").addEventListener("click", resetarTudo);
    el("btnLimparSelecaoDossie").addEventListener("click", () => {
        zerarSelecaoProcesso();
    });
    el("btnPagAnterior").addEventListener("click", () => {
        if (paginaAtual > 1)
            buscarProcessos(paginaAtual - 1, false);
    });
    el("btnPagProxima").addEventListener("click", () => {
        if (paginaAtual < totalPaginasAtual)
            buscarProcessos(paginaAtual + 1, false);
    });
    // Alternância de Modo do Modelo
    const btnAud = el("btnModoAuditoria");
    const btnPrev = el("btnModoPreventivo");
    const badgeModo = el("badgeModoAtivo");
    btnAud.addEventListener("click", async () => {
        if (modoAtual === "auditoria")
            return;
        modoAtual = "auditoria";
        btnAud.className =
            "text-left px-3 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white transition-all flex items-center justify-between";
        btnPrev.className =
            "text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-700 transition-all flex items-center justify-between";
        badgeModo.innerHTML = `<i class="fa-solid fa-magnifying-glass text-[10px]"></i> Modo Auditoria Completa`;
        badgeModo.className =
            "inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200";
        await carregarOpcoesFiltro(true);
        await buscarProcessos(paginaAtual, true);
    });
    btnPrev.addEventListener("click", async () => {
        if (modoAtual === "preventivo")
            return;
        modoAtual = "preventivo";
        btnPrev.className =
            "text-left px-3 py-2 rounded-lg text-xs font-semibold bg-amber-600 text-white transition-all flex items-center justify-between";
        btnAud.className =
            "text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-700 transition-all flex items-center justify-between";
        badgeModo.innerHTML = `<i class="fa-solid fa-shield-halved text-[10px]"></i> Modo Alerta na Assinatura`;
        badgeModo.className =
            "inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200";
        await carregarOpcoesFiltro(true);
        await buscarProcessos(paginaAtual, true);
    });
    // Menu Lateral
    el("navPainelGeral").addEventListener("click", (e) => {
        e.preventDefault();
        ativarItemMenuSidebar("navPainelGeral");
        el("mainScroll").scrollTo({ top: 0, behavior: "smooth" });
    });
    el("navLicitacoes").addEventListener("click", (e) => {
        e.preventDefault();
        ativarItemMenuSidebar("navLicitacoes");
        el("secao-licitacoes").scrollIntoView({ behavior: "smooth" });
    });
    el("navMapaRiscos").addEventListener("click", (e) => {
        e.preventDefault();
        ativarItemMenuSidebar("navMapaRiscos");
        el("secao-mapa").scrollIntoView({ behavior: "smooth" });
    });
    el("navEmpresas").addEventListener("click", async (e) => {
        e.preventDefault();
        ativarItemMenuSidebar("navEmpresas");
        const secEmp = el("secao-empresas");
        secEmp.classList.remove("hidden");
        await carregarPainelEmpresas();
        secEmp.scrollIntoView({ behavior: "smooth" });
    });
    el("btnFecharEmpresas").addEventListener("click", () => {
        el("secao-empresas").classList.add("hidden");
    });
    const acionarFiltroAlertas = async (e) => {
        if (e)
            e.preventDefault();
        ativarItemMenuSidebar("navAlertas");
        el("selectSituacao").value = "risco";
        await buscarProcessos(1, false);
        el("secao-licitacoes").scrollIntoView({ behavior: "smooth" });
    };
    el("navAlertas").addEventListener("click", acionarFiltroAlertas);
    el("btnSinoAlertas").addEventListener("click", () => acionarFiltroAlertas());
    el("navDossie").addEventListener("click", (e) => {
        e.preventDefault();
        ativarItemMenuSidebar("navDossie");
        el("secao-dossie").scrollIntoView({ behavior: "smooth" });
    });
    el("btnIrParaDossie").addEventListener("click", () => {
        ativarItemMenuSidebar("navDossie");
        el("secao-dossie").scrollIntoView({ behavior: "smooth" });
    });
    el("btnFiltrarPorOrgao").addEventListener("click", async () => {
        if (!processoDetalheAtual)
            return;
        el("selectCidade").value = processoDetalheAtual.municipio;
        await carregarOpcoesFiltro(true);
        el("selectOrgao").value = processoDetalheAtual.orgaoNome;
        await buscarProcessos(1, true);
        el("secao-licitacoes").scrollIntoView({ behavior: "smooth" });
    });
    el("btnFiltrarPorFornecedor").addEventListener("click", async () => {
        if (!processoDetalheAtual)
            return;
        el("selectCidade").value = "TODAS";
        el("selectOrgao").value = "TODOS";
        el("inputBusca").value = processoDetalheAtual.fornecedorDocFormatado;
        await carregarOpcoesFiltro(true);
        await buscarProcessos(1, true);
        el("secao-licitacoes").scrollIntoView({ behavior: "smooth" });
    });
    // Botões de Cópia Rápida no Dossiê
    el("btnCopiarCnpjOrgao").addEventListener("click", () => {
        copiarTextoComToast(el("detOrgaoCnpj").textContent || "", "CNPJ do Órgão");
    });
    el("btnCopiarCnpjFornecedor").addEventListener("click", () => {
        copiarTextoComToast(el("detFornecedorDoc").textContent || "", "Documento do Fornecedor");
    });
    el("btnCopiarIdPncp").addEventListener("click", () => {
        copiarTextoComToast(el("detIdPncp").textContent || "", "ID PNCP");
    });
    // Exportações (CSV, TXT e Impressão/PDF)
    el("btnExportarCsv").addEventListener("click", exportarTabelaCsv);
    el("btnBaixarFicha").addEventListener("click", baixarFichaTxt);
    el("btnExportarRelatorio").addEventListener("click", baixarFichaTxt);
    el("btnImprimirDossie").addEventListener("click", () => {
        window.print();
    });
    // Simulador em Tempo Real
    const painelSim = el("painelSimulador");
    el("btnAbrirSimulador").addEventListener("click", () => {
        painelSim.classList.toggle("hidden");
        if (!painelSim.classList.contains("hidden")) {
            painelSim.scrollIntoView({ behavior: "smooth" });
        }
    });
    el("btnFecharSimulador").addEventListener("click", () => {
        painelSim.classList.add("hidden");
    });
    el("btnExecutarSimulacao").addEventListener("click", executarSimulacaoManual);
});
