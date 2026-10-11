# Windows native dependency materials

This directory supplements the packaged dependency notices. The bridge's own
code is MIT licensed; these upstream files retain their original licenses and
copyright. The complete local collection and selected distribution inventory
are different: [distribution-manifest.json](distribution-manifest.json) lists
the SHA-checked files allowed into new packages. This is not legal certification.

## Observed binary and exact upstream inputs

- Native npm package: `@img/sharp-win32-x64@0.35.5`; libvips `8.18.7`.
- `libvips-42.dll` SHA-256 is
  `06dab07cc386748513337a31672b1d5269fbc770a14ff403080575665bf0813f`.
  Its bytes equal the DLL in the official
  [web/static Windows x64 release](https://github.com/libvips/build-win64-mxe/releases/tag/v8.18.7).
- The **separate C++ DLL is different by upstream design**: packaged `libvips-cpp-8.18.7.dll`
  SHA-256 `25001dbd05305a0a29119ab49933622c70b4a20ea12ef1d5d20ca40181db53bf`
  differs from that release's `libvips-cpp-42.dll`. Sharp's fixed
  [binding.gyp](https://github.com/lovell/sharp/blob/51a990faa26ade5586a4934ac9673c98d8893326/src/binding.gyp)
  builds this Windows C++ library from five libvips source files for MSVC standard
  library ABI compatibility; sharp-libvips' fixed
  [Windows recipe](https://github.com/lovell/sharp-libvips/blob/ebb95f8add54eee8bed840e3fb587e4cbec857d7/build/win.sh)
  removes the ZIP's C++ DLL. All five files match the checksum-verified libvips
  8.18.7 release sources. No DLL was substituted.
- The official npm archives for Sharp, its Windows binary, development headers/
  C++ sources and Windows development import library passed SHA-512 SRI and npm
  registry ECDSA signature verification. The archive's main DLL, C++ DLL and
  Sharp native module equal the installed dependencies byte for byte. The
  advertised SLSA subject digest and fixed Sharp tag/commit/workflow agree;
  **full Sigstore certificate/transparency verification is NOT_RUN**. Registry
  signatures and inspection of a provenance payload are separate evidence.
- The release recipe was inspected at build-win64-mxe commit
  `ef19ca09af2453d127453d677c849ccb37cf5694` (`v8.18.7`). Its base Dockerfile
  names MXE branch `llvm-mingw-20260924`. The observed branch commit
  `c36160b231e66e1cbe032ed54aef7617e8b259da` is pinned in this collection;
  the release's original container digest/branch state is **not verified**.

## What is included

- Unmodified GNU [GPLv3](licenses/GPL-3.0.txt) and
  [LGPLv3](licenses/LGPL-3.0.txt) full texts from gnu.org.
- The official binary ZIP's unmodified [LGPLv2.1 text](licenses/LGPL-2.1-libvips.txt).
  The upstream Sharp README explains use of LGPLv3 via the earlier license's
  "any later version" clause; this collection preserves both explanations.
- Unmodified upstream Sharp/native README, versions, Apache text and libvips
  README under `upstream/`.
- The reviewed MXE source/settings and its original license. The separately
  licensed status of build-win64-mxe recipes was not confirmed: its subtree is
  excluded from new binary and public source selections, including its cached
  repository tarball. [SOURCE_ACCESS.md](SOURCE_ACCESS.md) gives the exact
  required external build-source route, fixed commit and verified SHA.
- Original component license/copyright/patent/notice documents under
  `component-notices/`, including FreeType's FTL and MozJPEG's IJG text.
- [materials.json](materials.json) records URLs, versions, source recipe
  SHA-256 values, fetched archive hashes and retained notice-file hashes.
- [Sharp provenance](provenance/sharp-provenance.json) records npm SRI/signatures,
  native-file comparisons, five C++ sources, 695 header hashes, Windows import
  inputs, fixed source/workflow pointers and the unverified build details.
- [Librsvg crate sources](provenance/librsvg-crates.json) records all 357 external
  Cargo.lock entries, exact public archive URLs, lock SHA-256 values, declared
  licenses/authors and 638 retained original license/notice files (3,183,876
  bytes). All 357 archives matched their lock checksums: 38,675,419 downloaded
  bytes, below the enforced aggregate 100 MiB budget. These entries include
  development and other-target dependencies, not only proven linked inputs.
- [Supplemental notices](notice-supplements.json) retain the 13 missing
  filename-collector inputs: original Cargo declarations/authors, source
  headers, README/AUTHORS and six sets of fixed upstream full license texts
  with source byte-match verification. Four old MIT crates have no standalone
  copyright/license file; the original declarations and clearly identified
  standard MIT template are retained without inventing copyright details.

All 28 versioned component source archives have been downloaded and matched to
the fixed recipes' SHA-256 values. The 144,170,343 bytes of component archives are kept
separately in `third_party/native-source/`; they are excluded from the MCPB.
The fixed build/MXE source archives are also cached there. Nothing was published.
The crate archives and four Sharp source/development/binary archives are also
excluded from the MCPB. [source-cache-allowlist.json](source-cache-allowlist.json)
records the complete historical cache inputs; it contains only relative paths under
`third_party/native-source/`, with sizes and SHA-256 values. Runtime data,
browser profiles, images and `.runtime` evidence are outside this allowlist.
New source bundles use [source-access.json](source-access.json), which selects
405 inputs from that cache and excludes the unlicensed repository archive and
two verification binary archives. The binary selector excludes the entire
native-source cache. The old frozen archives are not amended by this selection.

## Naming corrections

`versions.json` uses short runtime keys. `archive` is **libarchive 3.8.9**,
licensed under BSD 2-Clause according to the exact upstream recipe/README and
its retained COPYING. `imagequant` is **lovell/libimagequant 2.4.1**, the BSD
2-Clause fork identified explicitly by build-win64-mxe; it must not be confused
with a different modern libimagequant licensing arrangement. The other aliases
and source URLs are recorded in `materials.json`.

The GLib 2.90.0 source archive already includes 14 GVDB source/license/build
files; those are retained under `provenance/glib/subprojects/gvdb/`. Its wrap
names revision `2b42fc75f09dbe1cd1057580b5782b08f2dcb400`. Although the release
contains a PCRE2 wrap, the reviewed Windows recipe removes the PCRE2 dependency
and GRegex implementation. A wrap's presence does not establish that its source
is missing or required by this target.

## Source access and replacement rights

Before a public binary release, arrange an actual maintained download route for
the matching application source and selected native source bundle next to the
binary, with clear directions to the required fixed external build source.
A private cache or a past upstream access test is not itself a continuing
source-availability guarantee. No
written source offer, retention commitment or legal promise has been published
on the owner's behalf.

The bridge's MIT terms do not restrict modification, replacement, or reverse
engineering for debugging modifications where the applicable LGPL permits it.
The native libraries are ordinary local files under the extension's own
`node_modules`; [REPLACEMENT.md](REPLACEMENT.md) gives the version-specific
rebuild/assembly route and the already-passed isolated replacement controls.
A modified ABI-compatible native compilation remains NOT_RUN.

## Remaining precise review gaps

1. The separate C++ bridge's official npm archive and source/build route are
   reconciled; an independent native rebuild is not claimed. The fixed Sharp
   workflow uses `windows-2022` and Node `^22`, which do not prove the original
   MSVC toolset, runner image or a bit-identical rebuild.
2. No Cargo vendor/build or exhaustive target-linked dependency determination
   was run. All 357 locked archives and the 13 supplemental notice inputs are
   retained; declarations are not a legal certification.
3. A modified compatible native rebuild is NOT_RUN. Missing/replaced DLL
   failure controls and restored PNG/JPEG/WebP decoding passed in an isolated
   copy; no installed library was changed. An exact compiler/container match,
   bit-identical rebuild and full Sigstore verification are not automatic
   requirements for this material gate.
4. New packaging must pass exact staged file/hash verification, exclude the
   unlicensed recipe subtree and cache, and provide both version-matched source
   assets. Public binary release additionally needs actual public source
   access directions/availability; no public access is claimed before that
   separately authorized publication. Playwright's embedded bundle notices
   remain a separate inventory in the main third-party notices.

To reproduce this collection locally, first install the project's locked pnpm
dependencies on Windows x64 so the expected native package is available, then
run the following from the project root with Python 3.11+, Node.js and network
access:

```text
python scripts/native-materials.py --fetch-sources --fetch-sharp-provenance --fetch-rust-sources --rust-max-bytes 104857600
```

The Rust collector can separately verify its cache with
`python scripts/native_rust_materials.py --offline`; running that command writes
a fresh collection report and records zero new network bytes. A lower network
budget is accepted, a value above 100 MiB is rejected, and incomplete fetches
never promote an unchecked archive. No `.runtime` files are prerequisites: a cold
cache downloads the official web/static libvips ZIP into
`third_party/native-source/` and verifies SHA-256
`a736af61d3b46499760efa606e469cb14e060445b1f6fd36a1fa2e75009e1197`;
an existing cached ZIP must pass the same check. It downloads fixed official inputs,
checks source archive hashes, and writes only this review directory and the
separate native-source cache. It does not install, compile, generate images,
contact people, or publish artifacts.

After collection, run `python scripts/native-notice-supplements.py`,
`python scripts/native-source-access-check.py` and
`node scripts/native-distribution.mjs --prepare`. The first two fetch only small
fixed upstream notice/access inputs; the last performs local SHA checks and
writes the project's own selection metadata. `package-native-source.py` uses
that exact selection, not the full historical cache list. The MCPB packager
must use `copyNativeMaterials` and `verifyStagedNativeMaterials` from the
selector module. The selector never publishes or installs anything.
