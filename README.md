# 🛡️ LicitWatch MT

> **Plataforma Institucional de Auditoria e Controle Social de Processos Licitatórios de Mato Grosso**  
> Detecção de anomalias estatísticas e inconsistências contratuais utilizando **Machine Learning (Isolation Forest + TreeSHAP)** e malha cartográfica oficial do IBGE para os **141 municípios** do Estado de Mato Grosso.

---

## 📋 Visão Geral

O **LicitWatch MT** é uma solução GovTech desenvolvida para transformar dados brutos do **Portal Nacional de Contratações Públicas (PNCP)** em inteligência acionável para auditores, órgãos de controle, jornalistas e cidadãos.

A plataforma analisa uma base histórica de **9.021 contratos** e **5.016 empresas fornecedoras** em Mato Grosso, identificando desvios estatísticos de comportamento orçamentário, vigência atípica, distorções em valores de parcelas e excesso de termos aditivos.

---

## ✨ Principais Funcionalidades

- 🗺️ **Mapa Interativo Oficial do IBGE (141 Municípios):**
  - Polígonos vetoriais reais do IBGE para todos os 141 municípios mato-grossenses.
  - Alternância de visão entre **Semáforo de Risco por IA** e as **22 Microrregiões Geográficas**.
  - Gaveta de índice numérico de municípios (1 a 141) com busca rápida e colisão de rótulos otimizada.

- 🤖 **Motor de Inteligência Artificial Explicável (XAI):**
  - **Algoritmo:** `IsolationForest` com contaminação calibrada a 5% (Top anomalias).
  - **Explicabilidade:** `TreeSHAP` para atribuir com precisão a contribuição de cada variável na decisão.
  - **Modo Preventivo (Na Assinatura):** Avalia se o contrato já nasceu com risco no ato da celebração (sem aditivos).
  - **Modo Auditoria Completa:** Avalia o ciclo de vida completo incluindo prorrogações e termos aditivos.

- 💬 **Explicações em Linguagem Simples (Citizen-Friendly):**
  - Tradução dos vetores estatísticos para frases claras em português acessível.
  - Tabela comparativa de 5 colunas: *O que foi analisado*, *Valor no processo*, *Padrão em Mato Grosso*, *Significado prático* e *Impacto no risco*.
  - Justificativa detalhada tanto para processos com alerta quanto para processos regulares.

- 📊 **Termômetro de Risco & Dossiê Individual:**
  - Velocímetro interativo com semáforo dinâmico (Verde / Amarelo / Vermelho).
  - Dossiê completo das partes (Contratante, CNPJ, Unidade Compradora, Fornecedor, histórico de contratos no Estado).
  - Botões de cópia rápida em 1 clique para CNPJs e IDs de controle do PNCP.

- 🧪 **Simulador Contratual em Tempo Real:**
  - Permite aos auditores simular novos contratos ou editais antes da homologação, calculando instantaneamente o índice de anomalia contra a distribuição estadual.

- 📑 **Exportações Oficiais:**
  - Exportação de dados filtrados em planilha **.CSV**.
  - Emissão de dossiê individual em **.TXT** e relatório visual formatado para impressão/salvamento em **PDF**.

---

## 🛠️ Tecnologias Utilizadas

- **Frontend & Backend Web:** Node.js + TypeScript nativo (sem dependências pesadas de runtime, alta performance e baixa latência).
- **Interface:** HTML5 semântico, Tailwind CSS v4, FontAwesome 6, Plotly.js.
- **Machine Learning & Ciência de Dados:** Python 3, Scikit-Learn (`IsolationForest`), SHAP (`TreeExplainer`), Pandas, NumPy, Joblib.
- **Cartografia:** GeoJSON/SVG oficial do IBGE simplificado para visualização interativa em alta velocidade.

---

## 🚀 Como Executar o Projeto Localmente

### Pré-requisitos
- **Node.js** (v18 ou superior recomendado)
- **Python 3.10+** (necessário para o simulador em tempo real e re-treinamento de modelos)

### 1. Clonar o Repositório
```bash
git clone https://github.com/theussgabriel-web/LicitWhatchMT.git
cd LicitWhatchMT
```

### 2. Instalar Dependências
```bash
npm install
pip install -r requirements.txt
```

### 3. Iniciar o Sistema (Modo de Desenvolvimento)
```bash
npm run dev
```

Ou, se preferir apenas compilar e iniciar o servidor de produção:
```bash
npm run build
npm start
```

### 4. Acessar a Plataforma
Abra seu navegador em:
👉 **[http://localhost:3000](http://localhost:3000)**

---

## 📂 Estrutura de Diretórios

```
├── data/
│   └── pncp_mt_completo.json        # Base tratada de 9.021 contratos e metadados
├── modelos_salvos/
│   └── artefatos_modelos_pncp_mt.joblib # Modelos pré-treinados IsolationForest + SHAP
├── public/
│   ├── index.html                   # Interface completa institucional
│   ├── styles.css                   # Customizações de estilo e regras de impressão
│   ├── mt_mapa_real.json            # Malha cartográfica oficial dos 141 municípios de MT
│   └── js/
│       └── app.js                   # JavaScript compilado do frontend
├── src/
│   ├── server.ts                    # Servidor HTTP Node.js + TypeScript (API REST)
│   ├── types.ts                     # Definições de tipos TypeScript compartilhados
│   └── client/
│       └── app.ts                   # Lógica da interface, mapas, filtros e gráficos
├── ml_engine.py                     # Pipeline de treinamento e predição IsolationForest + SHAP
├── avaliar_cli.py                   # Script de inferência e integração Python-Node
├── tsconfig.json                    # Configuração TypeScript do Servidor
├── tsconfig.client.json             # Configuração TypeScript do Cliente
└── package.json                     # Scripts e dependências do projeto
```

---

## 📄 Licença e Uso

Este projeto foi desenvolvido para fins de auditoria pública, controle social e transparência governamental com base nos dados abertos do **Portal Nacional de Contratações Públicas (PNCP)**.

