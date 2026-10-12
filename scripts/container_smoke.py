"""Run inside the built ephemeral container without exposing any host port."""
import json
import os
import subprocess
import time
import urllib.error
import urllib.request

env = os.environ | {'SMARTI_MODE': 'demo', 'SMARTI_DEVELOPMENT': 'true',
                    'SMARTI_ORIGIN': 'http://localhost:8443'}
process = subprocess.Popen(['python', '/opt/smarti/run.py'], env=env)
try:
    for attempt in range(40):
        try:
            with urllib.request.urlopen('http://127.0.0.1:8443/healthz', timeout=1) as response:
                assert json.load(response) == {'status': 'running'}
            break
        except (urllib.error.URLError, ConnectionError):
            time.sleep(.25)
    else:
        raise RuntimeError('Container failed to become live')
    with urllib.request.urlopen('http://127.0.0.1:8443/api/bootstrap') as response:
        assert json.load(response) == {'configured': False, 'mode': 'demo'}
    with urllib.request.urlopen('http://127.0.0.1:8443/') as response:
        assert '<title>SMARTi</title>' in response.read().decode()
    try:
        urllib.request.urlopen('http://127.0.0.1:8443/api/home')
        raise AssertionError('Anonymous home access was allowed')
    except urllib.error.HTTPError as error:
        assert error.code == 401
    print('Container smoke passed: liveness, static UI, explicit demo and denied anonymous access')
finally:
    process.terminate()
    process.wait(timeout=10)
