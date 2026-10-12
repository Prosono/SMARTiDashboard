FROM python:3.14-slim@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170
ARG BUILD_VERSION=0.1.0
ARG BUILD_ARCH=amd64
LABEL io.hass.version=$BUILD_VERSION io.hass.type="app" io.hass.arch=$BUILD_ARCH
WORKDIR /opt/smarti
COPY backend/requirements.lock backend/requirements.lock
RUN pip install --no-cache-dir -r backend/requirements.lock
COPY backend/app backend/app
COPY frontend/dist frontend/dist
COPY run.py /opt/smarti/run.py
ENV PYTHONPATH=/opt/smarti/backend SMARTI_DATA_DIR=/data SMARTI_STATIC_DIR=/opt/smarti/frontend/dist
EXPOSE 8443
CMD ["python", "/opt/smarti/run.py"]
