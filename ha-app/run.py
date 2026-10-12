"""Supervisor options are local files; no browser-controlled proxy settings."""
import json
import os
from pathlib import Path
options_file = Path('/data/options.json')
if options_file.exists():
    options = json.loads(options_file.read_text())
    os.environ.update({
        'SMARTI_INGRESS': 'true',
        'SMARTI_MODE': 'live',
        'SMARTI_ORIGIN': options['origin'],
        'SMARTI_ADDITIONAL_ORIGINS': json.dumps(options.get('additional_origins', [])),
        'SMARTI_ALLOW_HTTP_INGRESS': str(options.get('allow_http_ingress', False)).lower(),
        'SMARTI_ZIGBEE2MQTT_BASE_TOPIC': options.get('zigbee2mqtt_base_topic', 'zigbee2mqtt'),
        'SMARTI_BOOTSTRAP_SECRET': options.get('bootstrap_secret', ''),
    })
from app.run import main
main()
