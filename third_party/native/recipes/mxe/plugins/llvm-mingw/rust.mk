# This file is part of MXE. See LICENSE.md for licensing information.

PKG             := rust
$(PKG)_WEBSITE  := https://www.rust-lang.org/
$(PKG)_DESCR    := A systems programming language focused on safety, speed and concurrency.
$(PKG)_IGNORE   :=
# https://static.rust-lang.org/dist/2026-09-24/rustc-nightly-src.tar.xz.sha256
$(PKG)_VERSION  := nightly
$(PKG)_CHECKSUM := f2c139528ba025f1141935df4f634e18db614b9b3b1cf2ea59e3675a6ade89f3
$(PKG)_SUBDIR   := $(PKG)c-$($(PKG)_VERSION)-src
$(PKG)_FILE     := $(PKG)c-$($(PKG)_VERSION)-src.tar.xz
$(PKG)_URL      := https://static.rust-lang.org/dist/2026-09-24/$($(PKG)_FILE)
$(PKG)_DEPS     := $(BUILD)~$(PKG)
$(PKG)_TARGETS  := $(BUILD) $(MXE_TARGETS)

$(PKG)_DEPS_$(BUILD) := $(BUILD)~llvm

define $(PKG)_BUILD_$(BUILD)
    # x86_64-pc-linux-gnu -> x86_64-unknown-linux-gnu
    $(eval BUILD_RUST := $(firstword $(subst -, ,$(BUILD)))-unknown-linux-gnu)

    # Disable LTO, panic strategy and optimization settings while
    # we bootstrap Rust
    $(eval unexport CARGO_PROFILE_RELEASE_LTO)
    $(eval unexport CARGO_PROFILE_RELEASE_OPT_LEVEL)
    $(eval unexport CARGO_PROFILE_RELEASE_PANIC)

    cd '$(BUILD_DIR)' && $(SOURCE_DIR)/configure \
        --prefix='$(PREFIX)/$(BUILD)' \
        --sysconfdir='etc' \
        --release-channel=nightly \
        --enable-vendor \
        --enable-extended \
        --tools=cargo,src \
        --disable-lld \
        --disable-docs \
        --disable-codegen-tests \
        --disable-manage-submodules \
        --python='$(PYTHON3)' \
        --llvm-root='$(PREFIX)/$(BUILD)' \
        --set target.$(BUILD_RUST).cc='$(PREFIX)/$(BUILD)/bin/clang' \
        --set target.$(BUILD_RUST).cxx='$(PREFIX)/$(BUILD)/bin/clang++' \
        --set target.$(BUILD_RUST).linker='$(PREFIX)/$(BUILD)/bin/clang' \
        --set target.$(BUILD_RUST).ar='$(PREFIX)/$(BUILD)/bin/llvm-ar' \
        --set target.$(BUILD_RUST).ranlib='$(PREFIX)/$(BUILD)/bin/llvm-ranlib'

    # Enable networking while we build Rust from source. Assumes
    # that the Rust build is reproducible.
    $(eval export MXE_ENABLE_NETWORK := 1)

    # Ensure that the downloaded build dependencies of Cargo are
    # stored in the build directory.
    $(eval export CARGO_HOME := $(BUILD_DIR)/.cargo)

    # Build and install Rust
    # Note: we are only interested in the stage1 compiler
    cd '$(BUILD_DIR)' && \
        $(PYTHON3) $(SOURCE_DIR)/x.py install --stage 1 -j '$(JOBS)'
endef

define $(PKG)_BUILD
    $(eval COMPILER_RT_LIB := $(shell $(TARGET)-clang --print-libgcc-file-name))
    $(eval TARGET_RUST := $(PROCESSOR)-pc-windows-gnullvm)

    # Install Cargo config
    $(INSTALL) -d '$(PREFIX)/$(TARGET)/.cargo'
    (echo '[unstable]'; \
     echo 'build-std = ["std", "panic_abort"]'; \
     echo 'build-std-features = ["optimize_for_size", "compiler-builtins-c"]'; \
     echo 'trim-paths = true'; \
     echo '[build]'; \
     echo 'target = "$(TARGET_RUST)"'; \
     echo '[env]'; \
     echo 'CC_$(TARGET_RUST) = "$(TARGET)-clang"'; \
     echo 'LLVM_COMPILER_RT_LIB = "$(COMPILER_RT_LIB)"'; \
     echo '[target.$(TARGET_RUST)]'; \
     echo 'ar = "$(PREFIX)/$(BUILD)/bin/llvm-ar"'; \
     echo 'linker = "$(TARGET)-clang"'; \
     echo 'rustflags = ['; \
     $(if $(BUILD_STATIC), echo '    "-Ctarget-feature=+crt-static"$(comma)';) \
     echo '    "-Zlocation-detail=none",'; \
     echo '    "-Zfmt-debug=none"'; \
     echo ']';) \
             > '$(PREFIX)/$(TARGET)/.cargo/config.toml'
endef
