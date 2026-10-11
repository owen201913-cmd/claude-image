# This file is part of MXE. See LICENSE.md for licensing information.

PKG             := cargo-c
$(PKG)_WEBSITE  := https://github.com/lu-zero/cargo-c
$(PKG)_DESCR    := cargo applet to build and install C-ABI compatibile libraries
$(PKG)_IGNORE   :=
$(PKG)_VERSION  := 0.10.25
$(PKG)_CHECKSUM := 8054b12ae8b64259e7b63e40368406dd6b6510d5d92b658152b361c5d816a5de
$(PKG)_GH_CONF  := lu-zero/cargo-c/tags,v
$(PKG)_TARGETS  := $(BUILD)
$(PKG)_DEPS_$(BUILD) := $(BUILD)~rust

define $(PKG)_PREPARE
    MXE_ENABLE_NETWORK=1 $(WGET) -P '$(SOURCE_DIR)' \
        'https://github.com/lu-zero/cargo-c/releases/download/v$($(PKG)_VERSION)/Cargo.lock'

    # Ensure that the downloaded build dependencies of Cargo are
    # stored in the build directory.
    $(eval export CARGO_HOME := $(BUILD_DIR)/.cargo)

    cd '$(SOURCE_DIR)' && MXE_ENABLE_NETWORK=1 cargo fetch \
        --locked \
        --target '$(shell rustc --print host-tuple)'
endef

define $(PKG)_BUILD_$(BUILD)
    $($(PKG)_PREPARE)

    # Disable LTO, panic strategy and optimization settings while
    # we build cargo-c
    $(eval unexport CARGO_PROFILE_RELEASE_LTO)
    $(eval unexport CARGO_PROFILE_RELEASE_OPT_LEVEL)
    $(eval unexport CARGO_PROFILE_RELEASE_PANIC)

    cd '$(SOURCE_DIR)' && cargo build \
        --release \
        --frozen

    cargo install \
        --frozen \
        --path='$(SOURCE_DIR)' \
        --root='$(PREFIX)/$(BUILD)'
endef
