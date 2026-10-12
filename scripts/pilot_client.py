"""Demonstrate browser-issued pairing and native bearer access over local/relayed TLS.

Uses only isolated demo credentials; prints neither credentials nor tokens.
"""
import argparse
import json
import ssl
import time
from pathlib import Path

import httpx

parser = argparse.ArgumentParser()
parser.add_argument('directory', type=Path)
args = parser.parse_args()
root = args.directory.resolve()
trust = ssl.create_default_context(cafile=str(root / 'public/home.crt'))
owner = json.loads((root / 'secrets/owner.json').read_text())
# Wait for startup only. Device commands and refresh exchanges are never retried.
with httpx.Client(verify=trust, trust_env=False, timeout=2) as probe:
    for port in (18444, 19443):
        for attempt in range(80):
            try:
                if probe.get(f'https://localhost:{port}/api/mobile/v1/session').status_code == 401:
                    break
            except httpx.TransportError:
                pass
            time.sleep(.25)
        else:
            raise SystemExit(f'Pilot listener {port} did not become ready')

with httpx.Client(base_url='https://localhost:18443', verify=trust, trust_env=False,
                  headers={'origin': 'https://localhost:18443'}) as web:
    response = web.post('/api/login', json=owner)
    response.raise_for_status()
    web.headers['x-csrf-token'] = response.json()['csrf']
    invitation = web.post('/api/mobile/pairings')
    invitation.raise_for_status()
    invitation = invitation.json()
    with httpx.Client(base_url='https://localhost:19443', verify=trust, trust_env=False) as phone:
        paired = phone.post('/api/mobile/v1/pair', json={'installation_id': invitation['installation_id'],
                            'code': invitation['code'], 'device_name': 'Docker pilot client'})
        paired.raise_for_status()
        tokens = paired.json()
        phone.headers['authorization'] = 'Bearer ' + tokens['access_token']
        try:
            home = phone.get('/api/mobile/v1/home')
            home.raise_for_status()
            assert home.json()['mode'] == 'demo', 'This script must never operate live devices'
            result = phone.post('/api/mobile/v1/controls/light.living_pendant/commands', json={'action': 'turn_off'})
            result.raise_for_status()
            assert result.json()['status'] == 'simulated'
            phone.get('https://localhost:18444/api/mobile/v1/home').raise_for_status()
            response = phone.post('/api/mobile/v1/refresh', json={
                'installation_id': tokens['installation_id'], 'refresh_token': tokens['refresh_token']})
            response.raise_for_status()
            phone.headers['authorization'] = 'Bearer ' + response.json()['access_token']
            phone.get('/api/mobile/v1/session').raise_for_status()
            print('PASS: pairing, remote home, simulated command, local access and token rotation')
        finally:
            web.delete('/api/mobile/devices/' + tokens['device_id']).raise_for_status()
        assert phone.get('/api/mobile/v1/home').status_code == 401
        print('PASS: revoked phone denied through relay')
    web.post('/api/logout').raise_for_status()
