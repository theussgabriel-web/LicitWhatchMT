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
pip install -r ml/requirements.txt
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
├── backend/                         # API REST (Node.js + TypeScript)
│   ├── src/
│   │   ├── server.ts                # Servidor HTTP e rotas da API
│   │   └── types.ts                 # Tipos TypeScript compartilhados
│   └── tsconfig.json
├── frontend/                        # Interface web
│   ├── src/
│   │   └── app.ts                   # Lógica da interface, mapas, filtros e gráficos
│   ├── public/                      # Arquivos estáticos servidos pelo backend
│   │   ├── index.html
│   │   ├── styles.css
│   │   ├── mt_mapa_real.json        # Malha cartográfica dos 141 municípios de MT
│   │   └── js/app.js                # JavaScript compilado do frontend
│   └── tsconfig.json
├── ml/                              # Motor de Machine Learning (Python)
│   ├── ml_engine.py                 # Treinamento e predição IsolationForest + SHAP
│   ├── avaliar_cli.py               # Inferência chamada pelo backend (simulador)
│   ├── exportar_dados_node.py       # Gera data/pncp_mt_completo.json
│   ├── app.py                       # Dashboard Streamlit (legado)
│   ├── requirements.txt
│   ├── modelos_salvos/              # Modelos pré-treinados (.joblib)
│   ├── resultados/                  # Gráficos, tabelas e base parquet
│   └── notebooks/                   # Notebook e script original do projeto
├── data/
│   └── pncp_mt_completo.json        # Base tratada de 9.021 contratos e metadados
├── docs/                            # Relatório técnico e protótipos de design
├── scripts/
│   └── iniciar_sistema.bat          # Atalho para compilar e iniciar no Windows
└── package.json                     # Scripts de build/execução
```

> O simulador usa o Python do `PATH`. Para usar outro executável, defina a variável de ambiente `PYTHON_EXE`.

---

## 📄 Licença e Uso

Este projeto foi desenvolvido para fins de auditoria pública, controle social e transparência governamental com base nos dados abertos do **Portal Nacional de Contratações Públicas (PNCP)**.

