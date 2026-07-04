# Wasabi ships linux builds for x86_64 and aarch64 only (no riscv), so restrict
# the build matrix. Overrides to s9pk.mk must precede the include statement.
ARCHES := x86 arm
include s9pk.mk
