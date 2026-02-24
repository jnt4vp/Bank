.PHONY: dev dev-no-db test test-backend test-frontend

dev:
	./scripts/dev.sh

dev-no-db:
	SKIP_DB_START=1 ./scripts/dev.sh

test: test-backend test-frontend

test-backend:
	@if [ -x .venv/bin/python ]; then \
		.venv/bin/python -m unittest discover -s backend/tests -p 'test_*.py'; \
	else \
		python -m unittest discover -s backend/tests -p 'test_*.py'; \
	fi

test-frontend:
	npm test
