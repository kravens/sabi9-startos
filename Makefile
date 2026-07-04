# Sabi9 - StartOS package build.
# The SDK ships the real build logic; this file just includes it (per the packaging guide).
-include node_modules/@start9labs/start-sdk/s9pk.mk

# Fallback help when the SDK is not installed yet:
.PHONY: help
help:
	@echo "1. npm install          # pulls @start9labs/start-sdk (provides s9pk.mk)"
	@echo "2. make                 # builds sabi9.s9pk"
	@echo "3. start-cli package install sabi9.s9pk   # sideload onto your Start9"
