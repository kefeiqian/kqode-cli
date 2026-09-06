FROM ubuntu:24.04

WORKDIR /app

COPY fixture/ /app/

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/* && git init -b main && git config user.name Golden && git config user.email golden@example.invalid && git add tracked.txt && git commit -m initial && printf 'after\n' > tracked.txt
