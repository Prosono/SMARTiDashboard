.PHONY: setup dev test lint build package container e2e
setup:
	python3 -m venv .venv
	.venv/bin/pip install -r backend/requirements.lock
	.venv/bin/pip install --no-deps -e backend
	npm --prefix frontend ci
dev:
	.venv/bin/python scripts/dev.py
test:
	.venv/bin/pytest backend/tests -q
	npm --prefix frontend test
lint:
	.venv/bin/ruff check --config backend/pyproject.toml backend
	.venv/bin/ruff format --check --config backend/pyproject.toml backend
	npm --prefix frontend run lint
build:
	npm --prefix frontend run build
package: build
	.venv/bin/python scripts/package.py
container: package
	docker build -t smarti:1.34.0 ha-app
e2e:
	cd frontend && npx playwright test
