FROM python:3.14-slim@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170
WORKDIR /opt/smarti
COPY backend/requirements.lock /tmp/requirements.lock
RUN pip install --no-cache-dir -r /tmp/requirements.lock
COPY backend/app ./app
ENV PYTHONUNBUFFERED=1
USER 10001:10001
EXPOSE 8443 9443
CMD ["python", "-m", "app.relay"]
