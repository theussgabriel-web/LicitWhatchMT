# -*- coding: utf-8 -*-
"""
Exporta a base completa de 9.021 contratos de Mato Grosso com os scores,
percentuais de risco e valores SHAP locais pré-calculados nos dois modos
(Auditoria Completa e Alerta Preventivo) para consumo rápido pelo servidor Node.js + TypeScript.
"""

import json
import sys
from pathlib import Path
import numpy as np
import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")

from ml_engine import (
    DIRETORIO_BASE,
    FEATURES_AUDITORIA,
    FEATURES_PREVENTIVO,
    NOMES_AMIGAVEIS_FEATURES,
    calcular_indice_risco_vetorizado,
    classificar_prioridade,
    formatar_documento,
    formatar_valor_feature,
    treinar_ou_carregar_artefatos,
)

PASTA_DATA = DIRETORIO_BASE.parent / "data"
PASTA_DATA.mkdir(parents=True, exist_ok=True)
ARQUIVO_SAIDA = PASTA_DATA / "pncp_mt_completo.json"


def exportar() -> None:
    print("1. Carregando modelos e base histórica de Mato Grosso (9.021 processos)...")
    artefatos = treinar_ou_carregar_artefatos(forcar_retreinamento=False)
    df: pd.DataFrame = artefatos["df_historico"].copy()

    # -------------------------------------------------------------------------
    # Calcular matrizes escalonadas e valores SHAP em lote para os 9.021 processos
    # -------------------------------------------------------------------------
    print("2. Calculando valores SHAP locais para o Modo Auditoria Completa...")
    cfg_aud = artefatos["auditoria"]
    X_aud = df[FEATURES_AUDITORIA].copy()
    X_aud_scaled = cfg_aud["scaler"].transform(X_aud)
    shap_aud_matrix = np.asarray(cfg_aud["explainer"].shap_values(X_aud_scaled))

    print("3. Calculando valores SHAP locais para o Modo Alerta Preventivo...")
    cfg_prev = artefatos["preventivo"]
    df_prev_temp = df.copy()
    dt_ini = pd.to_datetime(df_prev_temp["data_vigencia_inicio"], errors="coerce")
    dt_fim = pd.to_datetime(df_prev_temp["data_vigencia_fim"], errors="coerce")
    vig_bruta = (dt_fim - dt_ini).dt.days
    df_prev_temp["tempo_vigencia_dias"] = cfg_prev["imputer"].transform(
        vig_bruta.to_frame(name="tempo_vigencia_dias")
    )
    df_prev_temp["log_valor_global"] = np.log1p(df_prev_temp["valor_global"].clip(lower=0))
    df_prev_temp["proporcao_parcela_global"] = np.where(
        df_prev_temp["valor_global"] > 0,
        df_prev_temp["valor_parcela"] / df_prev_temp["valor_global"],
        0.0,
    )
    X_prev = df_prev_temp[FEATURES_PREVENTIVO].copy()
    X_prev_scaled = cfg_prev["scaler"].transform(X_prev)
    shap_prev_matrix = np.asarray(cfg_prev["explainer"].shap_values(X_prev_scaled))

    scores_aud = cfg_aud["scores_referencia"]
    preds_aud = cfg_aud["preds_referencia"]
    riscos_aud = calcular_indice_risco_vetorizado(scores_aud, scores_aud, preds_aud)

    scores_prev = cfg_prev["scores_referencia"]
    preds_prev = cfg_prev["preds_referencia"]
    riscos_prev = calcular_indice_risco_vetorizado(scores_prev, scores_prev, preds_prev)

    # Posição no ranking para ambos os modos
    ordem_aud = np.argsort(np.argsort(scores_aud)) + 1
    ordem_prev = np.argsort(np.argsort(scores_prev)) + 1

    print("4. Montando registros estruturados para o backend Node.js + TypeScript...")
    registros = []
    total = len(df)

    for i in range(total):
        row = df.iloc[i]

        # SHAP Auditoria
        shap_aud_list = []
        for f_idx, col_f in enumerate(FEATURES_AUDITORIA):
            val_real = float(X_aud.iloc[i][col_f])
            imp = float(shap_aud_matrix[i, f_idx])
            shap_aud_list.append(
                {
                    "codigo": col_f,
                    "atributo": NOMES_AMIGAVEIS_FEATURES[col_f],
                    "valorReal": round(val_real, 4),
                    "valorFormatado": formatar_valor_feature(col_f, val_real),
                    "impactoShap": round(imp, 4),
                    "direcao": "Aumenta Risco (Puxa p/ Anomalia)" if imp < 0 else "Reduz Risco (Padrão Normal)",
                }
            )
        shap_aud_list.sort(key=lambda x: x["impactoShap"])

        # SHAP Preventivo
        shap_prev_list = []
        for f_idx, col_f in enumerate(FEATURES_PREVENTIVO):
            val_real = float(X_prev.iloc[i][col_f])
            imp = float(shap_prev_matrix[i, f_idx])
            shap_prev_list.append(
                {
                    "codigo": col_f,
                    "atributo": NOMES_AMIGAVEIS_FEATURES[col_f],
                    "valorReal": round(val_real, 4),
                    "valorFormatado": formatar_valor_feature(col_f, val_real),
                    "impactoShap": round(imp, 4),
                    "direcao": "Aumenta Risco (Puxa p/ Anomalia)" if imp < 0 else "Reduz Risco (Padrão Normal)",
                }
            )
        shap_prev_list.sort(key=lambda x: x["impactoShap"])

        s_aud = float(scores_aud[i])
        is_anom_aud = bool(preds_aud[i] == -1)
        r_aud = float(riscos_aud[i])
        prio_aud = classificar_prioridade(
            is_anom_aud, s_aud, cfg_aud["q10_anomalia"], cfg_aud["q40_anomalia"], r_aud
        )

        s_prev = float(scores_prev[i])
        is_anom_prev = bool(preds_prev[i] == -1)
        r_prev = float(riscos_prev[i])
        prio_prev = classificar_prioridade(
            is_anom_prev, s_prev, cfg_prev["q10_anomalia"], cfg_prev["q40_anomalia"], r_prev
        )

        registros.append(
            {
                "id": i + 1,
                "idPncp": str(row.get("numero_controle_pncp", "")),
                "idPncpCompra": str(row.get("numero_controle_pncp_compra", "")),
                "processo": str(row.get("processo", "")),
                "empenho": str(row.get("numero_contrato_empenho", "")),
                "tipoContrato": str(row.get("tipo_contrato_nome", "")),
                "categoria": str(row.get("categoria_processo_nome", "")),
                "anoContrato": int(row.get("ano_contrato", 2026)),
                "dataAssinatura": str(row.get("data_assinatura", "")),
                "dataVigenciaInicio": str(row.get("data_vigencia_inicio", "")),
                "dataVigenciaFim": str(row.get("data_vigencia_fim", "")),
                "orgaoNome": str(row.get("orgao_razao_social", "")),
                "orgaoCnpj": str(row.get("orgao_cnpj", "")),
                "orgaoCnpjFormatado": formatar_documento(str(row.get("orgao_cnpj", ""))),
                "unidadeNome": str(row.get("unidade_nome", "")),
                "esferaId": str(row.get("orgao_esfera_id", "")),
                "poderId": str(row.get("orgao_poder_id", "")),
                "municipio": str(row.get("nome_municipio", "")),
                "fornecedorNome": str(row.get("nome_razao_social_fornecedor", "")),
                "fornecedorDoc": str(row.get("ni_fornecedor", "")),
                "fornecedorDocFormatado": formatar_documento(str(row.get("ni_fornecedor", ""))),
                "tipoPessoa": str(row.get("tipo_pessoa", "")),
                "objeto": str(row.get("objeto_contrato", "")),
                "valorInicial": round(float(row.get("valor_inicial", 0.0)), 2),
                "valorGlobal": round(float(row.get("valor_global", 0.0)), 2),
                "valorParcela": round(float(row.get("valor_parcela", 0.0)), 2),
                "valorAditivado": round(float(row.get("valor_aditivado", 0.0)), 2),
                "proporcaoParcelaGlobal": round(float(row.get("proporcao_parcela_global", 0.0)), 4),
                "logValorGlobal": round(float(row.get("log_valor_global", 0.0)), 4),
                "tempoVigenciaDias": int(round(float(row.get("tempo_vigencia_dias", 0.0)))),
                "numeroRetificacoes": int(row.get("numero_retificacao", 0)),
                "numeroParcelas": int(row.get("numero_parcelas", 1)),
                "auditoria": {
                    "isAnomalia": is_anom_aud,
                    "riscoPercentual": r_aud,
                    "scoreAnomalia": round(s_aud, 6),
                    "posicaoRanking": int(ordem_aud[i]),
                    "faixaPrioridade": prio_aud["faixa"],
                    "rotuloCurto": prio_aud["rotulo_curto"],
                    "nivel": prio_aud["nivel"],
                    "cor": prio_aud["cor"],
                    "recomendacao": prio_aud["recomendacao"],
                    "shap": shap_aud_list,
                },
                "preventivo": {
                    "isAnomalia": is_anom_prev,
                    "riscoPercentual": r_prev,
                    "scoreAnomalia": round(s_prev, 6),
                    "posicaoRanking": int(ordem_prev[i]),
                    "faixaPrioridade": prio_prev["faixa"],
                    "rotuloCurto": prio_prev["rotulo_curto"],
                    "nivel": prio_prev["nivel"],
                    "cor": prio_prev["cor"],
                    "recomendacao": prio_prev["recomendacao"],
                    "shap": shap_prev_list,
                },
            }
        )

    payload = {
        "estatisticasMt": artefatos["estatisticas_mt"],
        "processos": registros,
    }

    with open(ARQUIVO_SAIDA, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    tamanho_mb = ARQUIVO_SAIDA.stat().st_size / (1024 * 1024)
    print(f"OK - Base exportada com sucesso para {ARQUIVO_SAIDA} ({tamanho_mb:.2f} MB)")


if __name__ == "__main__":
    exportar()

