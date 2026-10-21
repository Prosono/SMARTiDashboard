FROM python:3.14-slim@sha256:a2b82f3c48559aa0a8446d9af49826b6e2b2016f4cd2afabfe6013ec53729170
WORKDIR /opt/smarti
COPY backend/requirements.lock /tmp/requirements.lock
RUN pip install --no-cache-dir -r /tmp/requirements.lock && mkdir /data && chown 10001:10001 /data
COPY backend/app/cloud.py backend/app/cloud_push.py backend/app/cloud_admin.py backend/app/cloud_admin_cli.py backend/app/cloud_support.py backend/app/cloud_onboarding.py backend/app/cloud_enrollment.py backend/app/cloud_accounts.py backend/app/cloud_hub_credentials.py backend/app/hub_credentials.py backend/app/cloud_factory_reset.py backend/app/reset_credentials.py ./app/
COPY backend/app/cloud_web ./app/cloud_web
ENV PYTHONUNBUFFERED=1
USER 10001:10001
EXPOSE 8080
CMD ["uvicorn", "app.cloud:factory", "--factory", "--host", "0.0.0.0", "--port", "8080", "--proxy-headers", "--limit-concurrency", "16", "--no-access-log"]
