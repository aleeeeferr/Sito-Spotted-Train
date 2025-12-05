FROM nginx:1.27-alpine

WORKDIR /usr/share/nginx/html

# Config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Static assets and pages
COPY index.html ./index.html
COPY pages ./pages
COPY css ./css
COPY js ./js
COPY images ./images
COPY tariffario ./tariffario
