FROM python:3.13.7-slim-bookworm

COPY site/ /srv/www/

CMD ["python", "-m", "http.server", "8080", "--directory", "/srv/www"]
