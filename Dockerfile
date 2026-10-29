# ==============================================================================
# Dockerfile: LicitWatch MT
# Implantação completa em contêiner unificado (Node.js 20 + Python 3.11 ML)
# Plataforma alvo: Render Web Service (Docker)
# ==============================================================================

FROM node:20-bookworm-slim

# Metadados
LABEL maintainer="LicitWatch MT"
LABEL description="Plataforma de Auditoria e Detecção de Risco Licitatório (PNCP-MT)"

# Evita prompts interativos durante a instalação de pacotes
ENV DEBIAN_FRONTEND=noninteractive

# 1. Instalar interpretador Python 3, pip e suporte a ambiente virtual no Debian
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# 2. Configurar ambiente virtual Python dedicado para isolamento de bibliotecas (PEP 668)
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# 3. Definir diretório de trabalho da aplicação
WORKDIR /app

# 4. Variáveis de ambiente de produção
ENV NODE_ENV=production
ENV PORT=3000
ENV PYTHON_EXE=/opt/venv/bin/python3

# 5. Otimização de camadas de cache: copiar arquivos de dependências primeiro
COPY package*.json ./
COPY requirements.txt ./

# 6. Instalar dependências Node.js (incluindo TypeScript para o build)
RUN npm ci

# 7. Instalar dependências Python de inferência de Machine Learning no virtualenv
RUN pip install --no-cache-dir -r requirements.txt

# 8. Copiar o código-fonte da aplicação, dados e modelos
COPY . .

# 9. Compilar TypeScript (backend e frontend)
RUN npm run build

# 10. Ajustar permissões para o usuário não-root 'node' (segurança)
RUN chown -R node:node /app /opt/venv

# 11. Alternar para usuário não-root
USER node

# 12. Exposição da porta de comunicação (substituída dinamicamente pelo Render via $PORT)
EXPOSE 3000

# 13. Healthcheck para validação de integridade do serviço
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# 14. Inicialização do servidor com limite controlado de heap V8 para plano de 512MB
CMD ["node", "--max-old-space-size=256", "backend/dist/server.js"]
