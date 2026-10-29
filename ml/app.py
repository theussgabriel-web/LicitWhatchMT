# -*- coding: utf-8 -*-
"""
Sistema Intuitivo de Verificação de Anomalias em Processos Licitatórios (PNCP - MT).
Permite filtrar processos por Cidade (Município), Órgão Público, Empresa ou Situação de Risco,
visualizar todos os participantes do processo e verificar de forma clara se há risco de anomalia/fraude.
"""

from typing import Dict, Any

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import streamlit as st

from ml_engine import (
    avaliar_contrato_individual,
    formatar_documento,
    formatar_moeda_br,
    treinar_ou_carregar_artefatos,
)

# =============================================================================
# CONFIGURAÇÃO DA PÁGINA
# =============================================================================
st.set_page_config(
    page_title="Verificador de Licitações — Mato Grosso (PNCP)",
    page_icon="🔍",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown(
    """
    <style>
    .passo-titulo {
        background-color: #f1f5f9;
        padding: 0.65rem 1rem;
        border-radius: 8px;
        border-left: 5px solid #2563eb;
        font-weight: 700;
        font-size: 1.12rem;
        color: #1e293b;
        margin-top: 0.8rem;
        margin-bottom: 0.8rem;
    }
    .veredito-box-alerta {
        background-color: #fef2f2;
        border: 2px solid #ef4444;
        border-left: 10px solid #dc2626;
        padding: 1.25rem 1.5rem;
        border-radius: 10px;
        margin-bottom: 1rem;
    }
    .veredito-box-normal {
        background-color: #f0fdf4;
        border: 2px solid #22c55e;
        border-left: 10px solid #16a34a;
        padding: 1.25rem 1.5rem;
        border-radius: 10px;
        margin-bottom: 1rem;
    }
    .participante-card {
        background-color: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 1rem 1.2rem;
        height: 100%;
    }
    </style>
    """,
    unsafe_allow_html=True,
)


# =============================================================================
# CARREGAMENTO DOS MODELOS E DA BASE HISTÓRICA DE MT
# =============================================================================
@st.cache_resource(show_spinner="Carregando base de licitações de Mato Grosso e modelo de Machine Learning...")
def carregar_sistema_v3() -> Dict[str, Any]:
    return treinar_ou_carregar_artefatos()


try:
    artefatos = carregar_sistema_v3()
    df_historico: pd.DataFrame = artefatos["df_historico"]
    estatisticas_mt: Dict[str, Any] = artefatos["estatisticas_mt"]
except Exception as erro:
    st.error(f"Erro ao carregar a base de dados: {erro}")
    st.stop()


# Mapeamentos legíveis de Poder e Esfera
MAPA_ESFERA = {"M": "Municipal", "E": "Estadual", "F": "Federal"}
MAPA_PODER = {"E": "Executivo", "L": "Legislativo", "J": "Judiciário", "N": "Não Informado"}


# =============================================================================
# BARRA LATERAL: CONFIGURAÇÃO SIMPLES E SIMULADOR MANUAL
# =============================================================================
with st.sidebar:
    st.title("⚙️ Opções do Sistema")

    modo_selecionado_label = st.radio(
        "Modo de Análise do Modelo:",
        options=[
            "🔍 Auditoria Completa (Com Aditivos)",
            "🛡️ Alerta Preventivo (Na Assinatura)",
        ],
        index=0,
        help=(
            "• Auditoria Completa (Etapa 10): Avalia vigência, valor global, parcelas, valor aditivado e retificações.\n"
            "• Alerta Preventivo (Etapa 24): Avalia apenas vigência, valor global e parcelas no ato da assinatura."
        ),
    )
    modo_ativo = "auditoria" if "Auditoria" in modo_selecionado_label else "preventivo"
    col_score_ativo = f"score_{modo_ativo}"
    col_risco_ativo = f"risco_pct_{modo_ativo}"

    st.divider()
    st.subheader("📊 Resumo do Estado (MT)")
    st.markdown(
        f"""
        - **Total de Processos:** `{estatisticas_mt['total_contratos']:,}`
        - **Cidades Atendidas:** `{df_historico['nome_municipio'].nunique()}`
        - **Órgãos Públicos:** `{df_historico['orgao_razao_social'].nunique()}`
        - **Empresas Contratadas:** `{df_historico['ni_fornecedor'].nunique():,}`
        - **Processos com Risco:** `{int((df_historico[col_score_ativo] < 0).sum())}`
        """
    )

    st.divider()
    st.info(
        "💡 **Como usar:**\n"
        "1. Escolha a **Cidade** (ou deixe todas) e filtre como desejar.\n"
        "2. Clique em um **processo na tabela** para selecioná-lo.\n"
        "3. Veja abaixo **quem faz parte do processo** e se ele **tem risco de fraude/anomalia**."
    )


# =============================================================================
# CABEÇALHO PRINCIPAL
# =============================================================================
st.title("🔍 Verificador de Anomalias em Processos Licitatórios — MT")
st.caption(
    "Consulte as licitações e contratos públicos por cidade, órgão ou empresa, veja quem participa de cada processo "
    "e identifique possíveis sinais de risco com Inteligência Artificial (Isolation Forest + SHAP)."
)

# =============================================================================
# PASSO 1: FILTRAR POR CIDADE, ÓRGÃO, SITUAÇÃO DE RISCO OU BUSCA
# =============================================================================
st.markdown(
    '<div class="passo-titulo">1️⃣ Escolha a Cidade e Filtre os Processos Licitatórios</div>',
    unsafe_allow_html=True,
)

# Preparar lista de cidades ordenadas por quantidade de processos ou alfabeticamente
contagem_cidades = df_historico["nome_municipio"].value_counts()
lista_cidades = ["Todas as Cidades de MT"] + sorted(df_historico["nome_municipio"].dropna().unique().tolist())

f_col1, f_col2, f_col3, f_col4 = st.columns([1.2, 1.4, 1.1, 1.3])

with f_col1:
    cidade_escolhida = st.selectbox(
        "🏙️ Cidade (Município):",
        options=lista_cidades,
        index=0,
        format_func=lambda c: (
            f"📍 Todas as Cidades ({len(df_historico):,})"
            if c == "Todas as Cidades de MT"
            else f"{c} ({contagem_cidades.get(c, 0)} processos)"
        ),
    )

# Filtrar base preliminarmente pela cidade para popular os órgãos daquela cidade
if cidade_escolhida != "Todas as Cidades de MT":
    df_filtrado = df_historico[df_historico["nome_municipio"] == cidade_escolhida].copy()
else:
    df_filtrado = df_historico.copy()

lista_orgaos = ["Todos os Órgãos Públicos"] + sorted(df_filtrado["orgao_razao_social"].dropna().unique().tolist())

with f_col2:
    orgao_escolhido = st.selectbox(
        "🏛️ Órgão Público Contratante:",
        options=lista_orgaos,
        index=0,
    )

if orgao_escolhido != "Todos os Órgãos Públicos":
    df_filtrado = df_filtrado[df_filtrado["orgao_razao_social"] == orgao_escolhido]

with f_col3:
    filtro_risco = st.selectbox(
        "🚦 Situação de Risco:",
        options=[
            "Todos os Processos",
            "🚨 Apenas COM Risco (Anomalias)",
            "✅ Apenas SEM Risco (Normais)",
        ],
        index=0,
    )

if "COM Risco" in filtro_risco:
    df_filtrado = df_filtrado[df_filtrado[col_score_ativo] < 0]
elif "SEM Risco" in filtro_risco:
    df_filtrado = df_filtrado[df_filtrado[col_score_ativo] >= 0]

with f_col4:
    busca_texto = st.text_input(
        "🔎 Buscar Empresa, CNPJ, Processo ou Objeto:",
        placeholder="Digite para filtrar (opcional)...",
    )

if busca_texto.strip():
    termo = busca_texto.strip()
    mascara_txt = (
        df_filtrado["nome_razao_social_fornecedor"].astype(str).str.contains(termo, case=False, na=False)
        | df_filtrado["ni_fornecedor"].astype(str).str.contains(termo, case=False, na=False)
        | df_filtrado["cnpj_fornecedor_fmt"].astype(str).str.contains(termo, case=False, na=False)
        | df_filtrado["processo"].astype(str).str.contains(termo, case=False, na=False)
        | df_filtrado["numero_controle_pncp"].astype(str).str.contains(termo, case=False, na=False)
        | df_filtrado["objeto_contrato"].astype(str).str.contains(termo, case=False, na=False)
    )
    df_filtrado = df_filtrado[mascara_txt]

# Ordenar do maior risco para o menor risco
df_filtrado = df_filtrado.sort_values(by=col_score_ativo, ascending=True).reset_index(drop=True)

# Resumo Rápido dos Processos Filtrados
total_sel = len(df_filtrado)
qtd_risco_sel = int((df_filtrado[col_score_ativo] < 0).sum()) if total_sel > 0 else 0
qtd_normal_sel = total_sel - qtd_risco_sel
valor_total_sel = float(df_filtrado["valor_global"].sum()) if total_sel > 0 else 0.0

r1, r2, r3, r4 = st.columns(4)
r1.metric("Processos Encontrados", f"{total_sel:,}")
r2.metric(
    "🚨 Processos COM Risco",
    f"{qtd_risco_sel:,}",
    delta=f"{(qtd_risco_sel/total_sel*100):.1f}% do filtro" if total_sel > 0 else "0%",
    delta_color="inverse" if qtd_risco_sel > 0 else "off",
)
r3.metric("✅ Processos Normais (Sem Risco)", f"{qtd_normal_sel:,}")
r4.metric("💰 Valor Total dos Processos", formatar_moeda_br(valor_total_sel))

if total_sel == 0:
    st.warning("Nenhum processo encontrado para os filtros selecionados. Tente limpar o campo de busca ou mudar a cidade.")
    st.stop()

# =============================================================================
# TABELA INTERATIVA DE PROCESSOS (CLIQUE PARA VER DETALHES)
# =============================================================================
st.caption(
    "👇 **Clique em qualquer linha da tabela abaixo** (na caixinha à esquerda da linha) ou use o seletor para inspecionar o processo completo:"
)

df_tabela = pd.DataFrame(
    {
        "Situação": np.where(df_filtrado[col_score_ativo] < 0, "🚨 COM RISCO", "✅ SEM RISCO"),
        "Risco (%)": df_filtrado[col_risco_ativo],
        "Cidade": df_filtrado["nome_municipio"],
        "Nº Processo": df_filtrado["processo"],
        "Órgão Contratante": df_filtrado["orgao_razao_social"],
        "Empresa Contratada (Fornecedor)": df_filtrado["nome_razao_social_fornecedor"],
        "CNPJ / CPF": df_filtrado["cnpj_fornecedor_fmt"],
        "Valor Global (R$)": df_filtrado["valor_global"],
        "Vigência (Dias)": df_filtrado["tempo_vigencia_dias"].astype(int),
        "Aditivos": df_filtrado["numero_retificacao"].astype(int),
        "Objeto Resumido": df_filtrado["objeto_contrato"].astype(str).str.slice(0, 85) + "...",
    }
)

evento_selecao = st.dataframe(
    df_tabela,
    column_config={
        "Risco (%)": st.column_config.ProgressColumn(
            "Grau de Risco (%)",
            help="Índice de risco calculado pelo modelo Isolation Forest (0% a 100%).",
            format="%.1f%%",
            min_value=0,
            max_value=100,
        ),
        "Valor Global (R$)": st.column_config.NumberColumn(
            "Valor Global (R$)",
            format="R$ %.2f",
        ),
    },
    width="stretch",
    hide_index=True,
    height=280,
    on_select="rerun",
    selection_mode="single-row",
)

# Determinar qual linha está selecionada (pelo clique na tabela ou pelo selectbox sincronizado)
linhas_clicadas = evento_selecao.selection.rows if evento_selecao and hasattr(evento_selecao, "selection") else []
idx_padrao = int(linhas_clicadas[0]) if len(linhas_clicadas) > 0 else 0

idx_escolhido = st.selectbox(
    "🎯 Processo selecionado para verificação detalhada:",
    options=list(range(min(len(df_filtrado), 300))),
    index=min(idx_padrao, min(len(df_filtrado), 300) - 1),
    format_func=lambda i: (
        f"{'🚨 [COM RISCO - ' + str(df_filtrado.loc[i, col_risco_ativo]) + '%]' if df_filtrado.loc[i, col_score_ativo] < 0 else '✅ [SEM RISCO - ' + str(df_filtrado.loc[i, col_risco_ativo]) + '%]'} "
        f"{df_filtrado.loc[i, 'nome_municipio']} | Processo: {df_filtrado.loc[i, 'processo']} | "
        f"Empresa: {str(df_filtrado.loc[i, 'nome_razao_social_fornecedor'])[:38]} | "
        f"{formatar_moeda_br(df_filtrado.loc[i, 'valor_global'])}"
    ),
)

proc = df_filtrado.loc[idx_escolhido]

# =============================================================================
# PASSO 2: QUEM FAZ PARTE DO PROCESSO E DADOS DO CONTRATO
# =============================================================================
st.markdown(
    '<div class="passo-titulo">2️⃣ Quem Faz Parte do Processo e Dados da Contratação</div>',
    unsafe_allow_html=True,
)

# Calcular histórico da empresa fornecedora na base de MT
cnpj_atual = str(proc.get("ni_fornecedor", ""))
df_mesmo_fornecedor = df_historico[df_historico["ni_fornecedor"] == cnpj_atual]
qtd_contratos_forn = len(df_mesmo_fornecedor)
qtd_alertas_forn = int((df_mesmo_fornecedor[col_score_ativo] < 0).sum())
soma_valor_forn = float(df_mesmo_fornecedor["valor_global"].sum())

p_col1, p_col2, p_col3 = st.columns(3)

with p_col1:
    esfera_str = MAPA_ESFERA.get(str(proc.get("orgao_esfera_id", "")), str(proc.get("orgao_esfera_id", "N/I")))
    poder_str = MAPA_PODER.get(str(proc.get("orgao_poder_id", "")), str(proc.get("orgao_poder_id", "N/I")))
    st.markdown(
        f"""
        <div class="participante-card">
            <h4 style="margin-top:0; color:#1d4ed8;">🏛️ Quem Contrata (Órgão Público)</h4>
            <p style="margin:0.3rem 0;"><strong>Órgão:</strong> {proc.get('orgao_razao_social', 'Não informado')}</p>
            <p style="margin:0.3rem 0;"><strong>Unidade Compradora:</strong> {proc.get('unidade_nome', 'Não informada')}</p>
            <p style="margin:0.3rem 0;"><strong>CNPJ do Órgão:</strong> <code>{formatar_documento(proc.get('orgao_cnpj', ''))}</code></p>
            <p style="margin:0.3rem 0;"><strong>Cidade / UF:</strong> {proc.get('nome_municipio', 'N/I')} - MT</p>
            <p style="margin:0.3rem 0;"><strong>Esfera e Poder:</strong> {esfera_str} / {poder_str}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

with p_col2:
    tipo_pessoa_str = "Pessoa Jurídica (Empresa - PJ)" if str(proc.get("tipo_pessoa", "")) == "PJ" else f"Pessoa ({proc.get('tipo_pessoa', 'N/I')})"
    st.markdown(
        f"""
        <div class="participante-card">
            <h4 style="margin-top:0; color:#0f766e;">🏢 Quem Foi Contratado (Fornecedor)</h4>
            <p style="margin:0.3rem 0;"><strong>Razão Social / Nome:</strong> {proc.get('nome_razao_social_fornecedor', 'Não informado')}</p>
            <p style="margin:0.3rem 0;"><strong>CNPJ / CPF:</strong> <code>{formatar_documento(cnpj_atual)}</code></p>
            <p style="margin:0.3rem 0;"><strong>Natureza:</strong> {tipo_pessoa_str}</p>
            <p style="margin:0.3rem 0;"><strong>Histórico desta Empresa em MT:</strong> Possui <strong>{qtd_contratos_forn}</strong> contrato(s) na base (total de <strong>{formatar_moeda_br(soma_valor_forn)}</strong>), sendo <strong>{qtd_alertas_forn}</strong> com alerta de risco.</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

with p_col3:
    st.markdown(
        f"""
        <div class="participante-card">
            <h4 style="margin-top:0; color:#4338ca;">📄 Dados do Processo Licitatório</h4>
            <p style="margin:0.3rem 0;"><strong>Nº do Processo:</strong> <code>{proc.get('processo', 'Não informado')}</code></p>
            <p style="margin:0.3rem 0;"><strong>ID PNCP:</strong> <code>{proc.get('numero_controle_pncp', 'Não informado')}</code></p>
            <p style="margin:0.3rem 0;"><strong>Contrato / Empenho:</strong> <code>{proc.get('numero_contrato_empenho', 'N/I')}</code> ({proc.get('tipo_contrato_nome', 'Contrato')})</p>
            <p style="margin:0.3rem 0;"><strong>Categoria:</strong> {proc.get('categoria_processo_nome', 'Não informada')}</p>
            <p style="margin:0.3rem 0;"><strong>Assinatura e Vigência:</strong> Assinado em <code>{proc.get('data_assinatura', 'N/I')}</code> | Vigência: <code>{proc.get('data_vigencia_inicio', 'N/I')}</code> até <code>{proc.get('data_vigencia_fim', 'N/I')}</code> (<strong>{int(proc.get('tempo_vigencia_dias', 0))} dias</strong>)</p>
        </div>
        """,
        unsafe_allow_html=True,
    )

st.write("")
with st.container(border=True):
    st.markdown(f"**📦 Objeto Completo da Licitação / Contrato:** {proc.get('objeto_contrato', 'Não informado')}")

# =============================================================================
# PASSO 3: VEREDITO DE RISCO (TEM RISCO DE SER FRAUDULENTO / ANÔMALO OU NÃO?)
# =============================================================================
st.markdown(
    '<div class="passo-titulo">3️⃣ Resultado da Verificação: Este Processo Tem Risco de Anomalia / Fraude?</div>',
    unsafe_allow_html=True,
)

metadados_proc = {
    "id_pncp": str(proc.get("numero_controle_pncp", "")),
    "processo": str(proc.get("processo", "")),
    "empenho": str(proc.get("numero_contrato_empenho", "")),
    "categoria": str(proc.get("categoria_processo_nome", "")),
    "cnpj_fornecedor": cnpj_atual,
    "fornecedor": str(proc.get("nome_razao_social_fornecedor", "")),
    "orgao": str(proc.get("orgao_razao_social", "")),
    "municipio": str(proc.get("nome_municipio", "")),
    "objeto": str(proc.get("objeto_contrato", "")),
    "data_assinatura": str(proc.get("data_assinatura", "")),
}

res_ativo = avaliar_contrato_individual(
    artefatos=artefatos,
    modo=modo_ativo,
    valor_inicial=float(proc["valor_inicial"]),
    valor_global=float(proc["valor_global"]),
    valor_parcela=float(proc["valor_parcela"]),
    tempo_vigencia_dias=float(proc["tempo_vigencia_dias"]),
    numero_retificacao=int(proc["numero_retificacao"]),
    metadados=metadados_proc,
)

is_anom = res_ativo["is_anomalia"]
risco_pct = res_ativo["risco_percentual"]
prio = res_ativo["prioridade"]
df_shap = res_ativo["df_shap"]
fc = res_ativo["features_calculadas"]

if is_anom:
    st.markdown(
        f"""
        <div class="veredito-box-alerta">
            <h2 style="margin:0; color:#dc2626;">
                🚨 SIM — PROCESSO COM ALERTA DE RISCO ({risco_pct:.1f}%)
            </h2>
            <p style="margin:0.4rem 0 0 0; font-size:1.05rem; color:#7f1d1d;">
                <strong>Nível de Prioridade:</strong> {prio['faixa']}<br>
                <strong>O que isso significa?</strong> {prio['recomendacao']}
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )
else:
    st.markdown(
        f"""
        <div class="veredito-box-normal">
            <h2 style="margin:0; color:#15803d;">
                ✅ NÃO — PROCESSO DENTRO DO PADRÃO NORMAL ({risco_pct:.1f}% de Risco)
            </h2>
            <p style="margin:0.4rem 0 0 0; font-size:1.05rem; color:#14532d;">
                <strong>Nível de Prioridade:</strong> {prio['faixa']}<br>
                <strong>O que isso significa?</strong> {prio['recomendacao']}
            </p>
        </div>
        """,
        unsafe_allow_html=True,
    )

# Resumo dos Valores Financeiros do Processo Analisado
v1, v2, v3, v4, v5 = st.columns(5)
v1.metric("Valor Inicial", formatar_moeda_br(float(proc["valor_inicial"])))
v2.metric("Valor Global Atual", formatar_moeda_br(float(proc["valor_global"])))
v3.metric("Diferença / Aditivos", formatar_moeda_br(fc["valor_aditivado"]))
v4.metric("Prazo de Vigência", f"{int(fc['tempo_vigencia_dias'])} dias (~{fc['tempo_vigencia_dias']/365:.1f} anos)")
v5.metric("Qtd. Retificações", f"{int(proc['numero_retificacao'])}")

# Explicação clara dos motivos (SHAP) + Gráficos
col_motivos, col_grafico = st.columns([1.05, 1])

with col_motivos:
    st.markdown("#### 🧠 Por que o modelo chegou a essa conclusão? (Análise SHAP)")
    st.caption(
        "Veja abaixo o peso de cada característica deste processo. "
        "**Valores negativos (🚨)** aumentam a suspeita de anomalia; **valores positivos (✅)** indicam comportamento normal:"
    )
    df_exib_shap = df_shap[
        ["Atributo (Feature)", "Valor Formatado", "Impacto SHAP", "Direção"]
    ].rename(columns={"Valor Formatado": "Valor no Processo"})
    st.dataframe(
        df_exib_shap.style.format({"Impacto SHAP": "{:+.4f}"}),
        width="stretch",
        hide_index=True,
    )

with col_grafico:
    st.markdown("#### 📊 Gráfico de Impacto das Variáveis no Risco")
    fig_shap, ax_shap = plt.subplots(figsize=(6.8, 3.2))
    df_plot_shap = df_shap.sort_values(by="Impacto SHAP", ascending=True)
    cores_barras = ["#dc2626" if v < 0 else "#16a34a" for v in df_plot_shap["Impacto SHAP"]]

    ax_shap.barh(
        df_plot_shap["Atributo (Feature)"],
        df_plot_shap["Impacto SHAP"],
        color=cores_barras,
        alpha=0.88,
        edgecolor="#1e293b",
    )
    ax_shap.axvline(0, color="#1e293b", linestyle="--", linewidth=1)
    ax_shap.set_xlabel("Impacto SHAP (Vermelho = Puxa p/ Risco | Verde = Puxa p/ Normal)", fontsize=8.5)
    ax_shap.grid(axis="x", linestyle=":", alpha=0.6)
    plt.tight_layout()
    st.pyplot(fig_shap)
    plt.close(fig_shap)

# Opção expansível para Simular / Testar outro contrato digitando valores manualmente
with st.expander("🧮 Quero digitar/simular manualmente os valores de um processo para testar o risco"):
    st.markdown("Altere qualquer valor abaixo para simular em tempo real como o modelo classificaria um novo contrato:")
    s1, s2, s3, s4, s5 = st.columns(5)
    with s1:
        sim_vi = st.number_input("Valor Inicial (R$):", min_value=0.0, value=float(proc["valor_inicial"]), step=1000.0)
    with s2:
        sim_vg = st.number_input("Valor Global (R$):", min_value=0.0, value=float(proc["valor_global"]), step=1000.0)
    with s3:
        sim_vp = st.number_input("Valor Parcela (R$):", min_value=0.0, value=float(proc["valor_parcela"]), step=500.0)
    with s4:
        sim_dias = st.number_input("Vigência (Dias):", min_value=0, value=int(max(proc["tempo_vigencia_dias"], 0)), step=30)
    with s5:
        sim_ret = st.number_input("Qtd. Retificações:", min_value=0, value=int(proc["numero_retificacao"]), step=1)

    res_sim = avaliar_contrato_individual(
        artefatos=artefatos,
        modo=modo_ativo,
        valor_inicial=sim_vi,
        valor_global=sim_vg,
        valor_parcela=sim_vp,
        tempo_vigencia_dias=float(sim_dias),
        numero_retificacao=int(sim_ret),
    )
    if res_sim["is_anomalia"]:
        st.error(
            f"🚨 **Resultado da Simulação:** COM RISCO DE ANOMALIA — Índice de Risco: **{res_sim['risco_percentual']:.1f}%** "
            f"({res_sim['prioridade']['faixa']}) | Principal motivo: **{res_sim['df_shap'].iloc[0]['Atributo (Feature)']}**"
        )
    else:
        st.success(
            f"✅ **Resultado da Simulação:** SEM RISCO (Dentro do Padrão) — Índice de Risco: **{res_sim['risco_percentual']:.1f}%**"
        )

st.caption(
    "📌 *Nota Metodológica: Uma anomalia aponta um contrato matematicamente atípico frente ao histórico do PNCP/MT, "
    "funcionando como um alerta para direcionar a auditoria humana.*"
)
