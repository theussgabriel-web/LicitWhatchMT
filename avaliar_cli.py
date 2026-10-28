# -*- coding: utf-8 -*-
"""
Script CLI chamado pelo backend Node.js + TypeScript quando o usuário utiliza
o Simulador Manual de novos contratos/processos.
"""

import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

from ml_engine import avaliar_contrato_individual, treinar_ou_carregar_artefatos


def main() -> None:
    raw_input = sys.stdin.read()
    dados = json.loads(raw_input)

    artefatos = treinar_ou_carregar_artefatos(forcar_retreinamento=False)
    modo = dados.get("modo", "auditoria")

    res = avaliar_contrato_individual(
        artefatos=artefatos,
        modo=modo,
        valor_inicial=float(dados.get("valorInicial", 0.0)),
        valor_global=float(dados.get("valorGlobal", 0.0)),
        valor_parcela=float(dados.get("valorParcela", 0.0)),
        tempo_vigencia_dias=float(dados.get("tempoVigenciaDias", 365.0)),
        numero_retificacao=int(dados.get("numeroRetificacoes", 0)),
    )

    shap_list = []
    for _, row in res["df_shap"].iterrows():
        shap_list.append(
            {
                "codigo": str(row["codigo_feature"]),
                "atributo": str(row["Atributo (Feature)"]),
                "valorReal": float(row["Valor Real"]),
                "valorFormatado": str(row["Valor Formatado"]),
                "impactoShap": round(float(row["Impacto SHAP"]), 4),
                "direcao": str(row["Direção"]),
            }
        )

    saida = {
        "modo": res["modo"],
        "isAnomalia": bool(res["is_anomalia"]),
        "riscoPercentual": float(res["risco_percentual"]),
        "scoreAnomalia": round(float(res["score_anomalia"]), 6),
        "posicaoRanking": int(res["posicao_ranking_simulada"]),
        "faixaPrioridade": res["prioridade"]["faixa"],
        "rotuloCurto": res["prioridade"]["rotulo_curto"],
        "nivel": res["prioridade"]["nivel"],
        "cor": res["prioridade"]["cor"],
        "recomendacao": res["prioridade"]["recomendacao"],
        "featuresCalculadas": res["features_calculadas"],
        "shap": shap_list,
    }
    print(json.dumps(saida, ensure_ascii=False))


if __name__ == "__main__":
    main()

