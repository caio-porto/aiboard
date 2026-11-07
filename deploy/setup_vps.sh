#!/bin/bash
set -e

APP_DOMAIN="${APP_DOMAIN:-ai.yourdomain.com}"

echo "=== [1/4] Configurando Nginx para ${APP_DOMAIN} ==="
sed "s/ai.yourdomain.com/${APP_DOMAIN}/g" /opt/crewai/deploy/nginx_aiboard.conf.example > "/etc/nginx/sites-available/${APP_DOMAIN}"
ln -sf "/etc/nginx/sites-available/${APP_DOMAIN}" /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

echo "=== [2/4] Verificando SSL Certbot ==="
if [ -d "/etc/letsencrypt/live/${APP_DOMAIN}" ]; then
    echo "Certificado SSL já existe. Recarregando Nginx..."
    systemctl reload nginx
else
    echo "Solicitando certificado SSL com Certbot..."
    certbot --nginx -d "${APP_DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email || echo "Aviso: Certbot não pode ser concluído agora se o DNS ainda não estiver propagado."
fi

echo "=== [3/4] Construindo e Subindo Contêineres Docker ==="
cd /opt/crewai
if [ ! -f ".env" ]; then
    echo "Criando .env a partir de .env.example..."
    cp .env.example .env
fi

docker compose build
docker compose up -d

echo "=== [4/4] Status dos Contêineres ==="
docker compose ps
echo "Setup finalizado com sucesso! Acesse: https://${APP_DOMAIN}"
