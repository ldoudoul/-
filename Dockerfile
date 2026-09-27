FROM python:3.12-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libreoffice pandoc fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 4173
CMD ["python", "server.py", "--port", "4173"]
