# Sabi9 - StartOS package build.
# The real build logic ships in the SDK's s9pk.mk (from node_modules); this
# Makefile just includes it, per the packaging guide. Build with:
#   npm install && make            # -> sabi9_x86_64.s9pk / sabi9_aarch64.s9pk
#   make install                   # sideload to the StartOS box in ~/.startos/config.yaml
include node_modules/@start9labs/start-sdk/s9pk.mk
