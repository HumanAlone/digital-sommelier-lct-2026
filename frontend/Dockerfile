FROM nginx:1.27-alpine

COPY frontend /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY docker/frontend-entrypoint.sh /docker-entrypoint.d/40-wine-api-config.sh

RUN chmod +x /docker-entrypoint.d/40-wine-api-config.sh \
    && cp /etc/nginx/conf.d/default.conf /tmp/wine-nginx.conf \
    && sed -i 's/server backend:8000;/server 127.0.0.1:8000;/' /etc/nginx/conf.d/default.conf \
    && nginx -t \
    && cp /tmp/wine-nginx.conf /etc/nginx/conf.d/default.conf \
    && rm /tmp/wine-nginx.conf

EXPOSE 80
