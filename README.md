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

## 🐳 Implantação e Deploy com Docker (Render)

### 1. Visão Geral da Arquitetura de Produção

A aplicação é executada em contêiner Docker unificado baseado em Debian (`node:20-bookworm-slim`), contendo:
- **Backend Node.js 20**: Servidor HTTP nativo em TypeScript compilado, responsável pela API REST e pela entrega dos assets estáticos do frontend.
- **Frontend SPA**: HTML5, CSS3 e TypeScript compilado em `/frontend/public`, servido diretamente na raiz (`/`).
- **Runtime Python 3.11**: Ambiente virtual isolado em `/opt/venv` com bibliotecas científicas (`scikit-learn`, `shap`, `joblib`, `numpy`, `pandas`, `pyarrow`).
- **Inferência sob demanda**: O endpoint `/api/simular` aciona o script `ml/avaliar_cli.py` via `child_process.spawn`, carregando o modelo `artefatos_modelos_pncp_mt.joblib` e retornando métricas de anomalia e valores SHAP em JSON.

### 2. Pré-requisitos Locais
- **Node.js** (v18 ou superior) e **npm**
- **Docker** (para build e execução em contêiner local)
- **Python 3.10+** com pip (caso queira executar fora do Docker)

### 3. Como Executar Sem Docker
```bash
# 1. Instalar dependências Node e Python
npm install
pip install -r requirements.txt

# 2. Compilar e iniciar
npm run build
npm start
```
Acesse: `http://localhost:3000`

### 4. Como Construir a Imagem Docker
Na raiz do repositório:
```bash
docker build -t licitwatch-mt .
```

### 5. Como Iniciar o Contêiner Localmente
```bash
docker run -d --name licitwatch -p 3000:3000 -e PORT=3000 licitwatch-mt
```
Para acompanhar os logs de inicialização:
```bash
docker logs -f licitwatch
```

### 6. Porta e Variável `PORT`
O servidor detecta automaticamente a porta fornecida pela variável de ambiente `PORT` (fornecida dinamicamente pelo Render).
- **Fallback local:** `3000`
- **Host de escuta:** `0.0.0.0` (garante acessibilidade externa dentro do contêiner)

### 7. Rota de Health Check
- **Endpoint:** `GET /health` (também disponível em `GET /api/health`)
- **Comportamento:** Resposta rápida (< 5 ms) em código HTTP `200`, indicando que a base de 9.021 contratos está carregada e o servidor está pronto para tráfego. Não dispara o interpretador Python.

### 8. Variáveis de Ambiente
| Variável | Padrão no Contêiner | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP do servidor (injetada automaticamente pelo Render). |
| `NODE_ENV` | `production` | Modo de execução do Node.js. |
| `PYTHON_EXE` | `/opt/venv/bin/python3` | Caminho do interpretador Python para simulação. |

### 9. Arquivos Obrigatórios em Runtime
Os seguintes arquivos devem estar presentes no contêiner:
- `data/pncp_mt_completo.json` (base estruturada com ~33,6 MB)
- `ml/modelos_salvos/artefatos_modelos_pncp_mt.joblib` (modelo serializado com ~9,6 MB)
- `ml/resultados/modelos/contratos_mt_12m_scored.parquet` (dados de referência com ~2,2 MB)
- `ml/avaliar_cli.py` e `ml/ml_engine.py` (scripts de inferência)
- `frontend/public/` (arquivos estáticos, incluindo `mt_mapa_real.json` e `js/app.js`)

### 10. Como Configurar o Serviço no Render
No painel do [Render Dashboard](https://dashboard.render.com):
1. Clique em **New +** e selecione **Web Service**.
2. Conecte o repositório `theussgabriel-web/LicitWhatchMT`.
3. Preencha as configurações:
   - **Name:** `licitwatch-mt`
   - **Language:** `Docker`
   - **Branch:** `main`
   - **Root Directory:** *(deixar em branco / raiz)*
   - **Dockerfile Path:** `./Dockerfile`
   - **Instance Type / Plan:** `Free` (0.1 CPU, 512 MB RAM) para validação inicial.
   - **Health Check Path:** `/health`
4. Clique em **Create Web Service**.

### 11. Limitações do Plano Gratuito (Render Free)
- **CPU Compartilhada:** 0.1 CPU pode fazer a inicialização inicial levar entre 15 e 30 segundos.
- **Suspensão por Inatividade:** Após 15 minutos sem requisições, a instância é suspensa. A primeira requisição subsequente terá um *cold start* de cerca de 30 a 50 segundos.
- **Teto de RAM (512 MB):** O Node.js consome cerca de 110 MB após carregar a base. O simulador Python consome cerca de 150 a 180 MB durante a inferência SHAP.

### 12. Riscos de Memória e Mitigações Adotadas
- O Node.js foi configurado com a flag `--max-old-space-size=256`, forçando coleta agressiva de lixo da V8.
- O servidor possui controle de concorrência no endpoint `/api/simular`, impedindo que dois processos Python rodem simultaneamente no mesmo contêiner de 512 MB.
- As dependências Python foram reduzidas exclusivamente ao runtime de inferência (`numpy`, `pandas`, `scikit-learn`, `shap`, `joblib`, `pyarrow`), excluindo ferramentas de dashboard como `streamlit` e `matplotlib`.
- Se o simulador for utilizado intensivamente com múltiplas requisições simultâneas, recomenda-se o plano **Starter (1 GB RAM, $7/mês)** para evitar o encerramento do contêiner com código `137` (Out of Memory Killer).

### 13. Funcionamento do Processo Python
O backend Node.js não mantém o Python rodando continuamente na memória para poupar RAM. O Python é invocado via `child_process.spawn` estritamente quando o usuário clica em "Avaliar Novo Contrato" no simulador. Os dados trafegam via `stdin`/`stdout` em formato JSON e o processo é finalizado ao término da predição. Há um timeout de segurança de 45 segundos para matar processos que excedam o tempo esperado.

### 14. Compatibilidade das Versões de Machine Learning
Para evitar erros de desserialização do `artefatos_modelos_pncp_mt.joblib`:
- `numpy`: restrito à faixa `1.24.0` a `<2.0.0` (evita quebra de compatibilidade binária da ABI C do NumPy 2.x).
- `scikit-learn`: mantido na faixa `1.3.0` a `<1.6.0`.
- `shap`: faixa `0.44.0` a `<0.47.0`.

### 15. Processo Manual de Validação Pós-Deploy
Após a publicação do serviço no Render:
1. Verifique nos logs do Render a mensagem: `Base LicitWatch MT carregada: 9.021 processos`.
2. Acesse a URL fornecida pelo Render no navegador (`https://licitwatch-mt.onrender.com`).
3. Confirme que o mapa dos 141 municípios e a tabela de licitações carregam normalmente.
4. Acesse a rota `https://seu-dominio.onrender.com/health` e confirme o retorno `{"status":"ok", ...}`.
5. Acesse a aba **Simulador de Contratos**, preencha os campos de teste e clique em **Executar Análise de Risco**.
6. Confirme que o gauge de risco, a faixa de prioridade e os fatores SHAP são calculados com sucesso.

---

## 📄 Licença e Uso

Este projeto foi desenvolvido para fins de auditoria pública, controle social e transparência governamental com base nos dados abertos do **Portal Nacional de Contratações Públicas (PNCP)**.

