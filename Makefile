# Makefile for Sotto Sealed-Bid Procurement Engine

.PHONY: help install dev build start test lint e2e lighthouse security-scan ci

help:
	@echo "Available commands:"
	@echo "  install        - Install dependencies"
	@echo "  dev            - Start development server"
	@echo "  build          - Build production Next.js application"
	@echo "  start          - Start production server"
	@echo "  test           - Run unit tests"
	@echo "  lint           - Run linter"
	@echo "  e2e            - Run Playwright end-to-end tests"
	@echo "  lighthouse     - Run Lighthouse CI audit"
	@echo "  security-scan  - Audit dependencies and check license compliance"
	@echo "  ci             - Run all CI checks (lint, typecheck, coverage, contracts)"

install:
	npm install

dev:
	npm run dev

build:
	npm run build

start:
	npm run start

test:
	npm run test

lint:
	npm run lint

e2e:
	@echo "🎭 Running Playwright E2E tests (demo mode)..."
	npx playwright test

lighthouse:
	@echo "🔦 Running Lighthouse CI audit..."
	npx lhci autorun

security-scan:
	@echo "=== NPM AUDIT ==="
	npm audit --audit-level=high || true
	@echo ""
	@echo "=== LICENSE CHECK ==="
	npx license-checker --production --failOn "GPL-3.0;AGPL-3.0" --summary || true

ci:
	@echo "🧹 Running code quality and audit checks..."
	npm run ci
	@echo "🦀 Running Rust contract unit tests..."
	cargo test
	@echo "✅ All CI checks passed!"
