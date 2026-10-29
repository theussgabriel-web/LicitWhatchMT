# -*- coding: utf-8 -*-
"""
Motor de Machine Learning e Busca Inteligente para Verificação de Risco de Fraude / Anomalia
em Processos Licitatórios e Contratos Públicos (PNCP - MT).
Baseado nas Etapas 9, 10, 18, 20, 21 e 24 de `projeto_final_ml.py`.
"""

import re
from pathlib import Path
from typing import Dict, Any, Optional, List
import warnings

import joblib
import numpy as np
import pandas as pd
import shap
from sklearn.ensemble import IsolationForest
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")

# Caminhos padrão do projeto
DIRETORIO_BASE = Path(__file__).resolve().parent
CAMINHO_PARQUET_PADRAO = (
    DIRETORIO_BASE / "resultados" / "modelos" / "contratos_mt_12m_scored.parquet"
)
PASTA_MODELOS_SALVOS = DIRETORIO_BASE / "modelos_salvos"

# Definição das variáveis de cada modo conforme o projeto original
FEATURES_PREVENTIVO: List[str] = [
    "tempo_vigencia_dias",
    "log_valor_global",
    "proporcao_parcela_global",
]

FEATURES_AUDITORIA: List[str] = [
    "tempo_vigencia_dias",
    "valor_aditivado",
    "proporcao_parcela_global",
    "log_valor_global",
    "numero_retificacao",
]

NOMES_AMIGAVEIS_FEATURES: Dict[str, str] = {
    "tempo_vigencia_dias": "Prazo de Duração do Contrato",
    "valor_aditivado": "Diferença / Acréscimo de Valor (Aditivos)",
    "proporcao_parcela_global": "Peso da Parcela no Valor Total",
    "log_valor_global": "Valor Total do Contrato (R$)",
    "numero_retificacao": "Quantidade de Alterações (Aditivos)",
}


def formatar_moeda_br(valor: float) -> str:
    """Formata um número float para o padrão monetário brasileiro (R$ 1.234,56)."""
    sinal = "-" if valor < 0 else ""
    valor_abs = abs(float(valor))
    formatado = f"{valor_abs:,.2f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return f"{sinal}R$ {formatado}"


def limpar_documento(texto: str) -> str:
    """Remove qualquer pontuação, deixando apenas dígitos (útil para CNPJ/CPF)."""
    return re.sub(r"\D", "", str(texto or ""))


def formatar_documento(doc: str) -> str:
    """Formata CNPJ (14 dígitos) ou CPF (11 dígitos) para exibição amigável."""
    digitos = limpar_documento(doc)
    if len(digitos) == 14:
        return f"{digitos[:2]}.{digitos[2:5]}.{digitos[5:8]}/{digitos[8:12]}-{digitos[12:]}"
    if len(digitos) == 11:
        return f"{digitos[:3]}.{digitos[3:6]}.{digitos[6:9]}-{digitos[9:]}"
    return str(doc or "Não informado")


def calcular_indice_risco_percentual(
    score: float,
    scores_ref: np.ndarray,
    preds_ref: np.ndarray,
) -> float:
    """
    Converte o score contínuo do Isolation Forest em um Índice de Risco de 0.0% a 99.9%.
    - Contratos classificados como Anomalia (score < 0) recebem índice entre 55.0% e 99.9%,
      calibrado pelo percentil de severidade entre as anomalias da base histórica.
    - Contratos classificados como Normais (score >= 0) recebem índice entre 1.0% e 49.0%,
      calibrado pelo percentil entre os contratos normais.
    """
    scores_anomalos = scores_ref[preds_ref == -1]
    scores_normais = scores_ref[preds_ref == 1]

    if score < 0:
        if len(scores_anomalos) == 0:
            return 75.0
        # Percentual de anomalias que são menos graves (score maior) que este contrato
        severidade = float((scores_anomalos >= score).mean())
        risco = 55.0 + severidade * 44.9
        return round(float(np.clip(risco, 55.0, 99.9)), 1)
    else:
        if len(scores_normais) == 0:
            return 15.0
        # Percentual de contratos normais que são mais típicos (score maior) que este contrato
        proximidade_fronteira = float((scores_normais > score).mean())
        risco = 1.0 + proximidade_fronteira * 48.0
        return round(float(np.clip(risco, 1.0, 49.0)), 1)


def calcular_indice_risco_vetorizado(
    scores: np.ndarray,
    scores_ref: np.ndarray,
    preds_ref: np.ndarray,
) -> np.ndarray:
    """Versão vetorizada rápida de `calcular_indice_risco_percentual` para tabelas de busca."""
    scores_anomalos = np.sort(scores_ref[preds_ref == -1])
    scores_normais = np.sort(scores_ref[preds_ref == 1])

    resultado = np.zeros_like(scores, dtype=float)
    mask_anom = scores < 0
    mask_norm = ~mask_anom

    if mask_anom.any() and len(scores_anomalos) > 0:
        # Quantos scores_anomalos são >= score -> len - searchsorted(left)
        idx = np.searchsorted(scores_anomalos, scores[mask_anom], side="left")
        severidade = (len(scores_anomalos) - idx) / len(scores_anomalos)
        resultado[mask_anom] = np.clip(55.0 + severidade * 44.9, 55.0, 99.9)

    if mask_norm.any() and len(scores_normais) > 0:
        idx = np.searchsorted(scores_normais, scores[mask_norm], side="right")
        proximidade = (len(scores_normais) - idx) / len(scores_normais)
        resultado[mask_norm] = np.clip(1.0 + proximidade * 48.0, 1.0, 49.0)

    return np.round(resultado, 1)


def calcular_features_contrato(
    valor_inicial: float,
    valor_global: float,
    valor_parcela: float,
    tempo_vigencia_dias: Optional[float],
    numero_retificacao: int = 0,
    imputer_vigencia: Optional[SimpleImputer] = None,
    modo: str = "auditoria",
) -> Dict[str, float]:
    """
    Executa a Engenharia de Atributos (Etapas 9 e 24) para um contrato individual.
    """
    v_inicial = float(valor_inicial or 0.0)
    v_global = float(valor_global or 0.0)
    v_parcela = float(valor_parcela or 0.0)
    n_retif = int(numero_retificacao or 0)

    if modo == "preventivo":
        if tempo_vigencia_dias is None or np.isnan(tempo_vigencia_dias) or tempo_vigencia_dias < 0:
            if imputer_vigencia is not None:
                vigencia_final = float(imputer_vigencia.transform([[np.nan]])[0][0])
            else:
                vigencia_final = 365.0
        else:
            vigencia_final = float(tempo_vigencia_dias)
    else:
        if tempo_vigencia_dias is None or np.isnan(tempo_vigencia_dias):
            vigencia_final = -1.0
        else:
            vigencia_final = float(tempo_vigencia_dias)

    valor_aditivado = v_global - v_inicial
    proporcao_parcela_global = (v_parcela / v_global) if v_global > 0 else 0.0
    log_valor_global = float(np.log1p(max(v_global, 0.0)))

    return {
        "tempo_vigencia_dias": vigencia_final,
        "valor_aditivado": valor_aditivado,
        "proporcao_parcela_global": proporcao_parcela_global,
        "log_valor_global": log_valor_global,
        "numero_retificacao": float(n_retif),
    }


def carregar_base_historica(caminho_parquet: Path = CAMINHO_PARQUET_PADRAO) -> pd.DataFrame:
    """Carrega a base histórica processada de Mato Grosso (9.021 contratos)."""
    if not caminho_parquet.exists():
        raise FileNotFoundError(
            f"Arquivo da base histórica não encontrado em: {caminho_parquet}"
        )
    df = pd.read_parquet(caminho_parquet)
    # Garantir colunas auxiliares de busca rápida por documento limpo
    df["ni_fornecedor_limpo"] = df["ni_fornecedor"].astype(str).apply(limpar_documento)
    df["orgao_cnpj_limpo"] = df["orgao_cnpj"].astype(str).apply(limpar_documento)
    df["cnpj_fornecedor_fmt"] = df["ni_fornecedor"].astype(str).apply(formatar_documento)
    return df


def treinar_ou_carregar_artefatos(
    caminho_parquet: Path = CAMINHO_PARQUET_PADRAO,
    forcar_retreinamento: bool = False,
) -> Dict[str, Any]:
    """
    Carrega os modelos salvos em disco ou treina ambos os modos (Preventivo e Auditoria)
    a partir da base histórica de Mato Grosso (`contratos_mt_12m_scored.parquet`).
    """
    PASTA_MODELOS_SALVOS.mkdir(parents=True, exist_ok=True)
    caminho_bundle = PASTA_MODELOS_SALVOS / "artefatos_modelos_pncp_mt.joblib"

    df_historico = carregar_base_historica(caminho_parquet)

    if caminho_bundle.exists() and not forcar_retreinamento:
        try:
            artefatos = joblib.load(caminho_bundle)
            # Anexar colunas pré-calculadas dos dois modos na base em memória
            df_historico["score_auditoria"] = artefatos["auditoria"]["scores_referencia"]
            df_historico["risco_pct_auditoria"] = calcular_indice_risco_vetorizado(
                artefatos["auditoria"]["scores_referencia"],
                artefatos["auditoria"]["scores_referencia"],
                artefatos["auditoria"]["preds_referencia"],
            )
            df_historico["score_preventivo"] = artefatos["preventivo"]["scores_referencia"]
            df_historico["risco_pct_preventivo"] = calcular_indice_risco_vetorizado(
                artefatos["preventivo"]["scores_referencia"],
                artefatos["preventivo"]["scores_referencia"],
                artefatos["preventivo"]["preds_referencia"],
            )
            artefatos["df_historico"] = df_historico
            return artefatos
        except Exception:
            pass

    # =========================================================================
    # 1. MODO AUDITORIA COMPLETA (Etapa 10: 5 features, contamination=0.05)
    # =========================================================================
    X_aud = df_historico[FEATURES_AUDITORIA].copy()
    scaler_aud = StandardScaler()
    X_aud_scaled = scaler_aud.fit_transform(X_aud)

    modelo_aud = IsolationForest(
        n_estimators=200,
        contamination=0.05,
        random_state=42,
        n_jobs=-1,
    )
    modelo_aud.fit(X_aud_scaled)

    scores_aud = modelo_aud.decision_function(X_aud_scaled)
    preds_aud = modelo_aud.predict(X_aud_scaled)
    scores_anomalias_aud = np.sort(scores_aud[preds_aud == -1])

    q10_aud = float(np.quantile(scores_anomalias_aud, 0.10))
    q40_aud = float(np.quantile(scores_anomalias_aud, 0.40))

    explainer_aud = shap.TreeExplainer(modelo_aud)

    # =========================================================================
    # 2. MODO ALERTA PREVENTIVO (Etapa 24: 3 features, sem leakage, auto)
    # =========================================================================
    df_prev = df_historico.copy()
    dt_ini = pd.to_datetime(df_prev["data_vigencia_inicio"], errors="coerce")
    dt_fim = pd.to_datetime(df_prev["data_vigencia_fim"], errors="coerce")
    vigencia_bruta = (dt_fim - dt_ini).dt.days

    imputer_prev = SimpleImputer(strategy="median")
    df_prev["tempo_vigencia_dias"] = imputer_prev.fit_transform(
        vigencia_bruta.to_frame(name="tempo_vigencia_dias")
    )
    df_prev["log_valor_global"] = np.log1p(df_prev["valor_global"].clip(lower=0))
    df_prev["proporcao_parcela_global"] = np.where(
        df_prev["valor_global"] > 0,
        df_prev["valor_parcela"] / df_prev["valor_global"],
        0.0,
    )

    X_prev = df_prev[FEATURES_PREVENTIVO].copy()
    scaler_prev = StandardScaler()
    X_prev_scaled = scaler_prev.fit_transform(X_prev)

    modelo_prev = IsolationForest(
        n_estimators=200,
        contamination="auto",
        random_state=42,
        n_jobs=-1,
    )
    modelo_prev.fit(X_prev_scaled)

    scores_prev = modelo_prev.decision_function(X_prev_scaled)
    preds_prev = modelo_prev.predict(X_prev_scaled)
    scores_anomalias_prev = np.sort(scores_prev[preds_prev == -1])

    q10_prev = float(np.quantile(scores_anomalias_prev, 0.10))
    q40_prev = float(np.quantile(scores_anomalias_prev, 0.40))

    explainer_prev = shap.TreeExplainer(modelo_prev)

    estatisticas_mt = {
        "total_contratos": int(len(df_historico)),
        "mediana_valor_global": float(df_historico["valor_global"].median()),
        "media_valor_global": float(df_historico["valor_global"].mean()),
        "mediana_vigencia_dias": float(imputer_prev.statistics_[0]),
        "qtd_anomalias_auditoria": int((preds_aud == -1).sum()),
        "qtd_anomalias_preventivo": int((preds_prev == -1).sum()),
    }

    artefatos_para_salvar = {
        "auditoria": {
            "features": FEATURES_AUDITORIA,
            "scaler": scaler_aud,
            "imputer": None,
            "modelo": modelo_aud,
            "explainer": explainer_aud,
            "scores_referencia": scores_aud,
            "preds_referencia": preds_aud,
            "q10_anomalia": q10_aud,
            "q40_anomalia": q40_aud,
        },
        "preventivo": {
            "features": FEATURES_PREVENTIVO,
            "scaler": scaler_prev,
            "imputer": imputer_prev,
            "modelo": modelo_prev,
            "explainer": explainer_prev,
            "scores_referencia": scores_prev,
            "preds_referencia": preds_prev,
            "q10_anomalia": q10_prev,
            "q40_anomalia": q40_prev,
        },
        "estatisticas_mt": estatisticas_mt,
    }

    try:
        joblib.dump(artefatos_para_salvar, caminho_bundle)
    except Exception:
        pass

    df_historico["score_auditoria"] = scores_aud
    df_historico["risco_pct_auditoria"] = calcular_indice_risco_vetorizado(
        scores_aud, scores_aud, preds_aud
    )
    df_historico["score_preventivo"] = scores_prev
    df_historico["risco_pct_preventivo"] = calcular_indice_risco_vetorizado(
        scores_prev, scores_prev, preds_prev
    )

    artefatos_para_salvar["df_historico"] = df_historico
    return artefatos_para_salvar


def classificar_prioridade(
    is_anomalia: bool,
    score: float,
    q10_anomalia: float,
    q40_anomalia: float,
    risco_pct: float = 0.0,
) -> Dict[str, str]:
    """
    Classifica o processo licitatório / contrato em níveis de Risco de Fraude/Anomalia.
    """
    if not is_anomalia:
        return {
            "faixa": "Baixo Risco (Dentro do Padrão Licitatório)",
            "rotulo_curto": "🟢 BAIXO RISCO",
            "nivel": "normal",
            "cor": "#27ae60",
            "recomendacao": (
                "Não foram detectados desvios estatísticos relevantes. O processo apresenta "
                "valores, vigência e parcelamento compatíveis com o histórico do PNCP/MT."
            ),
        }

    if score <= q10_anomalia:
        return {
            "faixa": "Risco Crítico de Irregularidade / Anomalia (Top 10%)",
            "rotulo_curto": "🔴 RISCO CRÍTICO",
            "nivel": "alta",
            "cor": "#c0392b",
            "recomendacao": (
                "ALERTA MÁXIMO: Processo situado entre os 10% mais atípicos do Estado. "
                "Forte indício de distorção contratual (ex: superfaturamento de aditivo, prazo "
                "incomum ou concentração financeira). Recomendada auditoria imediata do processo."
            ),
        }
    elif score <= q40_anomalia:
        return {
            "faixa": "Risco Alto de Anomalia Licitatória (Top 10% a 40%)",
            "rotulo_curto": "🟠 RISCO ALTO",
            "nivel": "media",
            "cor": "#d35400",
            "recomendacao": (
                "Sinal de risco elevado. O processo foge significativamente do padrão dos "
                "contratos públicos e exige verificação documental dos termos aditivos e edital."
            ),
        }
    else:
        return {
            "faixa": "Risco Moderado / Atenção (Anomalia Limítrofe)",
            "rotulo_curto": "🟡 RISCO MODERADO",
            "nivel": "baixa",
            "cor": "#f39c12",
            "recomendacao": (
                "Processo apresenta comportamento atípico moderado. Recomenda-se revisão "
                "preventiva dos fatores destacados na análise SHAP abaixo."
            ),
        }


def rotulo_risco_por_score(score: float, q10: float, q40: float) -> str:
    """Retorna o badge resumido de risco para exibição em tabelas."""
    if score >= 0:
        return "🟢 Baixo (Regular)"
    if score <= q10:
        return "🔴 Crítico (Top 10%)"
    if score <= q40:
        return "🟠 Alto (Top 10-40%)"
    return "🟡 Moderado (Alerta)"


def buscar_processos_pncp(
    df_historico: pd.DataFrame,
    artefatos: Dict[str, Any],
    termo_busca: str = "",
    campo_filtro: str = "todos",
    apenas_anomalias: bool = False,
    modo: str = "auditoria",
    limite: int = 200,
) -> Dict[str, Any]:
    """
    Pesquisa processos licitatórios e contratos por CNPJ da empresa, Razão Social,
    Nº do Processo, ID PNCP, Empenho, Órgão, Município ou Objeto.
    """
    modo_key = "preventivo" if modo == "preventivo" else "auditoria"
    col_score = f"score_{modo_key}"
    col_risco = f"risco_pct_{modo_key}"
    q10 = artefatos[modo_key]["q10_anomalia"]
    q40 = artefatos[modo_key]["q40_anomalia"]

    df_trab = df_historico.copy()

    termo = str(termo_busca or "").strip()
    termo_digitos = limpar_documento(termo)

    if termo:
        if campo_filtro == "cnpj_fornecedor":
            if termo_digitos:
                mascara = df_trab["ni_fornecedor_limpo"].str.contains(termo_digitos, na=False)
            else:
                mascara = df_trab["ni_fornecedor"].astype(str).str.contains(termo, case=False, na=False)
        elif campo_filtro == "nome_fornecedor":
            mascara = df_trab["nome_razao_social_fornecedor"].astype(str).str.contains(termo, case=False, na=False)
        elif campo_filtro == "processo_pncp":
            mascara = (
                df_trab["processo"].astype(str).str.contains(termo, case=False, na=False)
                | df_trab["numero_controle_pncp"].astype(str).str.contains(termo, case=False, na=False)
                | df_trab["numero_controle_pncp_compra"].astype(str).str.contains(termo, case=False, na=False)
                | df_trab["numero_contrato_empenho"].astype(str).str.contains(termo, case=False, na=False)
            )
        elif campo_filtro == "orgao_municipio":
            mascara = (
                df_trab["orgao_razao_social"].astype(str).str.contains(termo, case=False, na=False)
                | df_trab["nome_municipio"].astype(str).str.contains(termo, case=False, na=False)
                | (
                    df_trab["orgao_cnpj_limpo"].str.contains(termo_digitos, na=False)
                    if len(termo_digitos) >= 4
                    else False
                )
            )
        elif campo_filtro == "objeto":
            mascara = df_trab["objeto_contrato"].astype(str).str.contains(termo, case=False, na=False)
        else:
            # Busca inteligente em TODOS os campos simultaneamente
            mascara = (
                df_trab["nome_razao_social_fornecedor"].astype(str).str.contains(termo, case=False, na=False)
                | df_trab["processo"].astype(str).str.contains(termo, case=False, na=False)
                | df_trab["numero_controle_pncp"].astype(str).str.contains(termo, case=False, na=False)
                | df_trab["numero_controle_pncp_compra"].astype(str).str.contains(termo, case=False, na=False)
                | df_trab["numero_contrato_empenho"].astype(str).str.contains(termo, case=False, na=False)
                | df_trab["orgao_razao_social"].astype(str).str.contains(termo, case=False, na=False)
                | df_trab["nome_municipio"].astype(str).str.contains(termo, case=False, na=False)
                | df_trab["objeto_contrato"].astype(str).str.contains(termo, case=False, na=False)
            )
            if len(termo_digitos) >= 4:
                mascara = (
                    mascara
                    | df_trab["ni_fornecedor_limpo"].str.contains(termo_digitos, na=False)
                    | df_trab["orgao_cnpj_limpo"].str.contains(termo_digitos, na=False)
                )

        df_trab = df_trab[mascara]

    if apenas_anomalias:
        df_trab = df_trab[df_trab[col_score] < 0]

    # Ordenar sempre do MAIOR RISCO (menor score) para o menor risco
    df_trab = df_trab.sort_values(by=col_score, ascending=True)

    total_encontrados = len(df_trab)
    qtd_em_risco = int((df_trab[col_score] < 0).sum()) if total_encontrados > 0 else 0
    valor_total_encontrado = float(df_trab["valor_global"].sum()) if total_encontrados > 0 else 0.0
    maior_risco_pct = float(df_trab[col_risco].max()) if total_encontrados > 0 else 0.0
    risco_medio_pct = float(df_trab[col_risco].mean()) if total_encontrados > 0 else 0.0
    fornecedores_unicos = int(df_trab["ni_fornecedor"].nunique()) if total_encontrados > 0 else 0

    df_exibicao = df_trab.head(limite).copy()
    if not df_exibicao.empty:
        df_exibicao["nivel_risco_badge"] = [
            rotulo_risco_por_score(s, q10, q40) for s in df_exibicao[col_score]
        ]
        df_exibicao["risco_atual_pct"] = df_exibicao[col_risco]
        df_exibicao["score_atual"] = df_exibicao[col_score]

    return {
        "df_resultados": df_exibicao,
        "total_encontrados": total_encontrados,
        "qtd_em_risco": qtd_em_risco,
        "pct_processos_em_risco": (qtd_em_risco / total_encontrados * 100.0) if total_encontrados > 0 else 0.0,
        "valor_total_encontrado": valor_total_encontrado,
        "maior_risco_pct": maior_risco_pct,
        "risco_medio_pct": risco_medio_pct,
        "fornecedores_unicos": fornecedores_unicos,
    }


def formatar_valor_feature(nome_feature: str, valor: float) -> str:
    """Formata o valor de uma feature para exibição legível na tabela SHAP."""
    if nome_feature == "valor_aditivado":
        return formatar_moeda_br(valor)
    if nome_feature == "tempo_vigencia_dias":
        anos = valor / 365.0
        return f"{int(round(valor))} dias (~{anos:.1f} anos)" if valor >= 0 else "Não informado (-1)"
    if nome_feature == "proporcao_parcela_global":
        return f"{valor * 100:.2f}% ({valor:.4f})"
    if nome_feature == "log_valor_global":
        valor_reais = np.expm1(valor)
        return f"{valor:.2f} (equiv. {formatar_moeda_br(valor_reais)})"
    if nome_feature == "numero_retificacao":
        return f"{int(round(valor))} retificação(ões)"
    return f"{valor:.4f}"


def avaliar_contrato_individual(
    artefatos: Dict[str, Any],
    modo: str,
    valor_inicial: float,
    valor_global: float,
    valor_parcela: float,
    tempo_vigencia_dias: float,
    numero_retificacao: int = 0,
    metadados: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    """
    Executa a verificação completa de um processo/contrato no modo escolhido ('preventivo' ou 'auditoria'),
    retornando Índice de Risco de Fraude (%), predição, score, percentil, prioridade e explicação SHAP local.
    """
    modo_key = "preventivo" if modo == "preventivo" else "auditoria"
    config_modo = artefatos[modo_key]
    features_lista = config_modo["features"]
    scaler: StandardScaler = config_modo["scaler"]
    imputer: Optional[SimpleImputer] = config_modo["imputer"]
    modelo: IsolationForest = config_modo["modelo"]
    explainer: shap.TreeExplainer = config_modo["explainer"]
    scores_ref: np.ndarray = config_modo["scores_referencia"]
    preds_ref: np.ndarray = config_modo["preds_referencia"]

    # 1. Calcular features do contrato
    dict_features = calcular_features_contrato(
        valor_inicial=valor_inicial,
        valor_global=valor_global,
        valor_parcela=valor_parcela,
        tempo_vigencia_dias=tempo_vigencia_dias,
        numero_retificacao=numero_retificacao,
        imputer_vigencia=imputer,
        modo=modo_key,
    )

    df_input = pd.DataFrame([{col: dict_features[col] for col in features_lista}])
    X_scaled = scaler.transform(df_input)

    # 2. Predição, Score e Índice de Risco (%)
    pred = int(modelo.predict(X_scaled)[0])
    score = float(modelo.decision_function(X_scaled)[0])
    is_anomalia = pred == -1

    risco_percentual = calcular_indice_risco_percentual(
        score=score,
        scores_ref=scores_ref,
        preds_ref=preds_ref,
    )

    # 3. Percentil de risco em relação aos 9.021 contratos de MT
    pct_mais_atipico = float((scores_ref > score).mean() * 100.0)
    posicao_ranking_simulada = int((scores_ref < score).sum()) + 1

    # 4. Faixa de Prioridade / Risco
    prioridade = classificar_prioridade(
        is_anomalia=is_anomalia,
        score=score,
        q10_anomalia=config_modo["q10_anomalia"],
        q40_anomalia=config_modo["q40_anomalia"],
        risco_pct=risco_percentual,
    )

    # 5. Explicabilidade Local SHAP (Etapas 18 e 20)
    shap_vals_raw = explainer.shap_values(X_scaled)
    shap_vals = np.asarray(shap_vals_raw).reshape(-1)

    linhas_shap = []
    for idx, col in enumerate(features_lista):
        val_real = float(df_input.iloc[0][col])
        impacto = float(shap_vals[idx])
        linhas_shap.append(
            {
                "codigo_feature": col,
                "Atributo (Feature)": NOMES_AMIGAVEIS_FEATURES.get(col, col),
                "Valor Real": val_real,
                "Valor Formatado": formatar_valor_feature(col, val_real),
                "Impacto SHAP": impacto,
                "Direção": (
                    "🚨 Agrava Risco de Fraude/Anomalia"
                    if impacto < 0
                    else "✅ Reduz Risco (Padrão Normal)"
                ),
            }
        )

    df_shap = (
        pd.DataFrame(linhas_shap)
        .sort_values(by="Impacto SHAP", ascending=True)
        .reset_index(drop=True)
    )

    return {
        "modo": modo_key,
        "is_anomalia": is_anomalia,
        "risco_percentual": risco_percentual,
        "status_texto": (
            f"ALERTA DE RISCO LICITATÓRIO ({risco_percentual:.1f}%)"
            if is_anomalia
            else f"PROCESSO REGULAR / BAIXO RISCO ({risco_percentual:.1f}%)"
        ),
        "score_anomalia": score,
        "pct_mais_atipico": pct_mais_atipico,
        "posicao_ranking_simulada": posicao_ranking_simulada,
        "total_contratos_ref": len(scores_ref),
        "prioridade": prioridade,
        "features_calculadas": dict_features,
        "df_shap": df_shap,
        "valores_brutos": {
            "valor_inicial": float(valor_inicial),
            "valor_global": float(valor_global),
            "valor_parcela": float(valor_parcela),
            "tempo_vigencia_dias": float(dict_features["tempo_vigencia_dias"]),
            "numero_retificacao": int(numero_retificacao),
        },
        "metadados": metadados or {},
    }


def obter_exemplos_reais(df_historico: pd.DataFrame) -> Dict[str, Dict[str, Any]]:
    """
    Retorna casos reais da base de Mato Grosso para teste ou simulação.
    """
    df_ord = df_historico.sort_values(by="score_anomalia", ascending=True).reset_index(drop=True)
    c1 = df_ord.iloc[0]
    c2 = df_ord.iloc[1]
    df_retif = df_ord[df_ord["numero_retificacao"] >= 4]
    c3 = df_retif.iloc[0] if not df_retif.empty else df_ord.iloc[10]
    df_normais = df_ord[df_ord["is_anomalia"] == "Não"]
    c_normal = df_normais.iloc[len(df_normais) // 2]

    def extrair_dict(row: pd.Series, titulo: str) -> Dict[str, Any]:
        return {
            "titulo": titulo,
            "numero_controle_pncp": str(row.get("numero_controle_pncp", "")),
            "processo": str(row.get("processo", "")),
            "ni_fornecedor": str(row.get("ni_fornecedor", "")),
            "orgao_razao_social": str(row.get("orgao_razao_social", "")),
            "nome_municipio": str(row.get("nome_municipio", "")),
            "nome_razao_social_fornecedor": str(row.get("nome_razao_social_fornecedor", "")),
            "objeto_contrato": str(row.get("objeto_contrato", "")),
            "data_assinatura": str(row.get("data_assinatura", "")),
            "valor_inicial": float(row.get("valor_inicial", 0.0)),
            "valor_global": float(row.get("valor_global", 0.0)),
            "valor_parcela": float(row.get("valor_parcela", 0.0)),
            "tempo_vigencia_dias": float(row.get("tempo_vigencia_dias", 365.0)),
            "numero_retificacao": int(row.get("numero_retificacao", 0)),
        }

    return {
        "caso_1_top_risco": extrair_dict(
            c1, "🚨 Caso Real #1 (Maior Risco MT): Folha de Pagamento R$ 81 Milhões (5 anos)"
        ),
        "caso_2_sefaz": extrair_dict(
            c2, "⚠️ Caso Real #2 (Alta Prioridade): Arrecadação Tributária R$ 64,8 Milhões"
        ),
        "caso_3_retificacoes": extrair_dict(
            c3, "🔄 Caso Real #3 (Múltiplos Aditivos): Contrato com Retificações Sucessivas"
        ),
        "caso_normal_mediano": extrair_dict(
            c_normal, "✅ Caso Real #4 (Processo Regular): Dentro do Padrão Histórico de MT"
        ),
    }
