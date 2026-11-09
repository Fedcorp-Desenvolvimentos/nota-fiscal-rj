# Estágio 1: Build
FROM node:22-alpine AS build-stage

WORKDIR /app

# Copia arquivos de dependências
COPY package*.json ./
RUN npm ci

# Variáveis de build do Vite (embutidas no bundle). Vazio = mesma origem.
ARG VITE_API_BASE_URL=""
ARG VITE_N8N_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL VITE_N8N_URL=$VITE_N8N_URL

# Copia o restante do código e gera o build
COPY . .
RUN npm run build

# Estágio 2: Produção (Servindo com Nginx)
FROM nginx:stable-alpine

COPY --from=build-stage /app/dist /usr/share/nginx/html

# ATENÇÃO: Descomente e garanta que o arquivo nginx.conf existe na raiz
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]