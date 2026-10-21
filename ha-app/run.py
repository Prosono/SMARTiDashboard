"""Supervisor options are local files; no browser-controlled proxy settings."""
import json
import os
import logging

from app.remote_options import configure_remote_identity
from pathlib import Path
# This runs before credentials, databases, Bonjour or outbound connections.
from app.factory_image import initialize
from app.production_mode import start as start_production
start_production(Path('/data'))
initialize(Path('/data'))
options = {}
options_file = Path('/data/options.json')
if options_file.exists():
    options = json.loads(options_file.read_text())
    os.environ.update({
        'SMARTI_INGRESS': 'true',
        'SMARTI_MODE': 'live',
        'SMARTI_ORIGIN': options['origin'],
        'SMARTI_ADDITIONAL_ORIGINS': json.dumps(options.get('additional_origins', [])),
        'SMARTI_AUTO_LOCAL_ORIGINS': str(options.get('auto_local_origins', True)).lower(),
        'SMARTI_ALLOW_HTTP_INGRESS': str(options.get('allow_http_ingress', False)).lower(),
        'SMARTI_ZIGBEE2MQTT_BASE_TOPIC': options.get('zigbee2mqtt_base_topic', 'zigbee2mqtt'),
        'SMARTI_ZIGBEE2MQTT_TRANSPORT': options.get('zigbee2mqtt_transport', 'ha_mqtt'),
        'SMARTI_ZIGBEE2MQTT_SERVER': options.get('zigbee2mqtt_server', ''),
        'SMARTI_ZIGBEE2MQTT_AUTH_TOKEN': options.get('zigbee2mqtt_auth_token', ''),
        'SMARTI_BOOTSTRAP_SECRET': options.get('bootstrap_secret', ''),
    })
# Supervisor options are entered by the local HA administrator, never browser headers.
try:
    remote_identity = configure_remote_identity(options, Path('/data'))
    if remote_identity:
        os.environ['SMARTI_REMOTE_IDENTITY_FILE'] = str(remote_identity)
except (ValueError, OSError):
    os.environ.pop('SMARTI_REMOTE_IDENTITY_FILE', None)
    logging.getLogger(__name__).error(
        'Fjerntilgang kunne ikke klargjøres. Kontroller Hub-ID og Tilkoblingsnøkkel i SMARTi-konfigurasjonen. Lokal tilgang fortsetter.'
    )
from app.run import main
main()
