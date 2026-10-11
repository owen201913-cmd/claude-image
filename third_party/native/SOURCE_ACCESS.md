# Source access for the Windows native libraries

The bridge source is MIT. Included third-party files retain their own licenses;
the bridge's license does not replace LGPL, MPL, Apache, BSD or other terms.
This document gives exact source directions, not a legal certification or a
promise that private development files are publicly downloadable.

## What accompanies a binary distribution set

Publish the matching version's application `-source.zip` and selected
`-native-source.zip` beside the `.mcpb`, with their SHA-256 values and these
directions. [source-access.json](source-access.json) lists each selected native
archive's original HTTPS URL, version, bytes and verified SHA-256. It selects
405 cached inputs: 28 component releases, all 357 librsvg Cargo.lock registry
archives, the reviewed MXE snapshot, Sharp source/development inputs and other
recorded inputs. This conservative Cargo set includes development/other-target
entries, not only libraries proven linked into Windows.

The MCPB contains notices, original license texts and the source index. It does
not contain those large source archives. A private source cache or unpublished
local ZIP is not represented as a public source offer. At publication, give the
actual source asset locations next to the binary download and maintain
equivalent access for the applicable distribution period. No written offer or
three-year commitment has been made on the owner's behalf.

## Required external build source, deliberately not redistributed

The build-win64-mxe repository snapshot lacks a confirmed independent
redistribution license. Its recipes/patches subtree and full repository tarball
are excluded from this project's public source selection and new MCPB staging.
They remain necessary build inputs available from the exact upstream server:

- Repository commit: `ef19ca09af2453d127453d677c849ccb37cf5694`.
- [Fixed source archive](https://codeload.github.com/libvips/build-win64-mxe/tar.gz/ef19ca09af2453d127453d677c849ccb37cf5694).
- SHA-256: `f52864572e6df6e549016369fdb2705aa195a837bd7bc8c52e45f42b59ef97a7`.
- [Build instructions](https://github.com/libvips/build-win64-mxe/blob/ef19ca09af2453d127453d677c849ccb37cf5694/README.md),
  [build.sh](https://github.com/libvips/build-win64-mxe/blob/ef19ca09af2453d127453d677c849ccb37cf5694/build.sh),
  [vips recipe](https://github.com/libvips/build-win64-mxe/blob/ef19ca09af2453d127453d677c849ccb37cf5694/build/vips.mk)
  and [web target settings](https://github.com/libvips/build-win64-mxe/blob/ef19ca09af2453d127453d677c849ccb37cf5694/build/plugins/web-deps/vips-web.mk).

This exact archive was retrieved and hash-checked on the date in
[source-access-verification.json](source-access-verification.json). That past
check does not guarantee future availability or grant permission to mirror it.
GPLv3 section 6(d) permits an equivalent source-access server with clear
directions, while responsibility for continued access remains with the binary
distributor. If that route stops working, repair source access or stop the
affected public binary distribution; do not silently copy unlicensed material.

## Exact source and notices

- libvips 8.18.7 release SHA-256:
  `5baaead3b0bb20ffdb9e9ff09aa9fda08620923df77b63b436654cb5e0b3bf94`.
- librsvg 2.63.2 release SHA-256:
  `852b18e1a00b8605528825a27dc7748bff2a5dd254028f59dc22a34ea57e81b6`;
  its Cargo.lock SHA is
  `e79e2a2735a0b5b151bb4133becd3008223fabedd34a8b787a872edab9854941`.
- Five Sharp MSVC C++ bridge source files exactly match the libvips release;
  headers/import inputs and fixed upstream build pointers are recorded in
  [Sharp provenance](provenance/sharp-provenance.json).
- [Original component notices](component-notices/) and full GNU license texts
  are retained. [Supplemental notice inputs](notice-supplements.json) add 13
  filename-collector omissions. Four old MIT crates declared MIT and authors
  without a standalone copyright/license file; their original declarations
  are retained alongside a clearly identified standard MIT template, without
  inventing a copyright year or replacing their upstream terms.
- GLib's vendored GVDB sources/license are retained. PCRE2 is removed by the
  reviewed Windows target; the presence of a wrap is not proof it is linked.

The selected MXE snapshot is recorded, but the original container digest and
runner/compiler image are not verified. Bit-identical rebuilding and complete
Sigstore verification are not claimed. GPLv3 section 1 excludes qualifying
System Libraries and unmodified general-purpose tools from Corresponding
Source; it does not make every compiler source an automatic prerequisite.

## Local collection and selection

Source compilation and ordinary offline tests do not need the source cache.
Packaging a distributable binary/source set does need the selected native
source inputs; `pnpm run package` in a fresh clone is not sufficient on its own.

For a matching version's published native-source companion, obtain its actual
SHA-256 from that release, then run these commands with its local ZIP path and
real checksum (angle-bracket values below are placeholders):

```text
python scripts/restore-native-source.py <native-source.zip> --sha256 <release-sha256>
node scripts/native-distribution.mjs --prepare
```

The restore script checks the whole ZIP hash and each selected archive against
this checkout's source index. It restores only those 405 cache files, leaves
code/notices unchanged, refuses to overwrite changed cache files and performs
zero network requests. Excluded recipe/verification archives are not required
by the selector. Use a source checkout and companion from the same release.

If no companion is available, from an isolated source checkout with the locked
dependencies and Python/Node collect the exact official inputs in this order:

```text
python scripts/native-materials.py --fetch-sources --fetch-sharp-provenance --fetch-rust-sources --rust-max-bytes 104857600
python scripts/native-notice-supplements.py
python scripts/native-source-access-check.py
node scripts/native-distribution.mjs --prepare
python scripts/package-native-source.py
```

The collectors may recreate the excluded recipes locally for inspection. The
distribution selector must run afterwards; it rejects changed hashes and the
native packager copies only the selected files. These commands do not compile,
install, submit to Ngini, publish or alter browser profiles. Use the release
version currently in the checkout; frozen archives cannot be overwritten.

See [REPLACEMENT.md](REPLACEMENT.md) for modification/recombination directions,
[LGPLv3](licenses/LGPL-3.0.txt), [GPLv3](licenses/GPL-3.0.txt) and the original
component texts for applicable conditions.
