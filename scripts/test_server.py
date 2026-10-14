"""Ephemeral demo harness. Never uses live mode, .env or a real HA token."""
import os
import tempfile
import uvicorn
from app.config import Settings
from app.main import create_app
from app.demo import Demo

port = int(os.environ.get("SMARTI_TEST_PORT", "8765"))

with tempfile.TemporaryDirectory(prefix='smarti-e2e-') as directory:
    settings = Settings(_env_file=None, mode='demo', data_dir=directory, development=True,
                        origin=f'http://localhost:{port}', bootstrap_secret='isolated-e2e-secret-at-least-24')
    app = create_app(settings, Demo())
    app.state.auth.bootstrap('tester', 'test-password-not-for-live', settings.bootstrap_secret)
    with app.state.store.connect() as db:
        for entity in ['light.living_pendant', 'climate.living', 'light.kitchen']:
            db.execute('INSERT INTO favorites(user_id,entity_id) VALUES (1,?)', (entity,))
    uvicorn.run(app, host='127.0.0.1', port=port, access_log=False)
