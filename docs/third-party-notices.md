# Third-party notices and Windows native materials

Packaging note (RC6): the preserved upstream defmt-parser 1.0.0 README uses `../LICENSE-APACHE` and `../LICENSE-MIT` links. Both license texts are included beside that README under `third_party/native/notice-supplements/defmt-parser-1.0.0/`; the upstream checksummed README is not rewritten.

New source exports **and MCPB staging** omit `third_party/native/recipes/build-win64-mxe/` because no separate redistribution license was confirmed for that fixed upstream snapshot. New native-source companions also omit its repository tarball and two verification-only binary archives. Required fixed external build-source directions, SHA and an actual access observation are in [SOURCE_ACCESS.md](../third_party/native/SOURCE_ACCESS.md). Historical material manifests/frozen archives describe the fuller local snapshot, not the new exact selection. See [distribution manifest](../third_party/native/distribution-manifest.json) and the [distribution review](native-distribution-review.md); frozen artifacts are not retroactively approved or altered.

The new selector chooses and hash-checks 405 source companion inputs from the 408-entry historical cache index; excluded cache archives need not be restored in a fresh clone. Exact staged native files are checked against its manifest before packaging. Thirteen Rust notice-collector omissions now have supplemental original metadata/headers/AUTHORS and fixed upstream license inputs. Four old MIT crates lack standalone copyright/license files: their original MIT/author declarations and a clearly labeled standard template are retained, without fabricated copyright details. [REPLACEMENT.md](../third_party/native/REPLACEMENT.md) gives the MSVC-compatible rebuild/assembly route and limits of the passed isolated smoke. Public binary distribution still requires actual source-asset availability beside the binary and continued access to required external build source. A bit-identical native rebuild and full Sigstore verification are NOT_RUN, not automatic hard gates for this material selection.

The project owner has now selected MIT for the bridge's own code. Third-party
licenses remain separate. The new [native materials](../third_party/native/README.md)
include GPLv3/LGPLv3/LGPLv2.1 full texts, upstream notices, fixed recipes and a
28-component source manifest; all 28 fetched source archives matched the
recipe SHA-256 values. The source archives are held separately and excluded
from the MCPB. This is not a completed distribution-license review. The current locked npm name/version license declarations are retained in [npm package inventory](../third_party/npm-packages.json); standalone dependency license files are retained in the MCPB.

The inventory below describes the **frozen dev.8 candidate**, retained as
historical evidence. It does not amend that archive or establish a later
candidate's dependency bytes without a separate comparison.

Reviewed archive: `release/ngini-image-bridge-0.1.0-dev.8-win32.mcpb`.

SHA-256: `a05a54c5c6b2b3da78e125455edef0dfe9fd0c674c38bb420abf824e47291774`. Size: 15953630 bytes.

There are 101 packaged runtime package instances, representing 99 distinct name/version pairs and 98 package names. Repeated nested `content-type@2.1.0` manifests are counted once in the table and retain all paths in the JSON report. Declared SPDX expressions come from the packaged `package.json` files; they are not an independent legal conclusion.

The archive was read without extracting, executing, installing, or modifying dependencies. License and notice ownership follows the longest enclosing package root. File names identify the notice inventory; source-header and every embedded component attribution have not been exhaustively reviewed. No network verification was performed. These documents do not amend the frozen archive; applicability to any later candidate, including dev.9, requires a separate inventory comparison.

## Remaining public-release gaps

- `@img/sharp-win32-x64@0.35.5` declares `Apache-2.0 AND LGPL-3.0-or-later`. Full GPL/LGPL texts and 28 checksum-matched component source archives are now collected. Before public binary distribution, establish the actual corresponding-source download route and complete transitive-source/replacement review; the private source cache is not itself a public source offer.
- The two naming gaps are resolved: `archive` → libarchive 3.8.9 (BSD 2-Clause), `imagequant` → lovell/libimagequant 2.4.1 (BSD 2-Clause fork). Exact upstream recipes, COPYRIGHT/COPYING and aliases are retained. Beyond the 28-component list, all 357 registry crates in the pinned librsvg Cargo.lock have checksum-matched source archives and collected notices; GLib's vendored GVDB sources are also retained. This includes dependencies for other targets and development, so final Windows embedded attribution and applicable license choices still need reconciliation.
- The main libvips DLL exactly matches the official web/static release. The separate C++ bridge is intentionally built by [Sharp v0.35.5 binding.gyp](https://github.com/lovell/sharp/blob/v0.35.5/src/binding.gyp) for the MSVC ABI instead of reusing the upstream C++ DLL. Its packaged bytes match the official npm archive, with registry SRI and ECDSA integrity signatures verified; the five C++ source files also match libvips 8.18.7. Full Sigstore certificate/transparency-log verification and an exact native rebuild/relink test are NOT_RUN. Fixed source/build inputs and remaining transitive-source work are recorded in the native materials.
- Playwright includes `NOTICE`, `ThirdPartyNotices.txt`, and three bundle license sidecars. Their presence is recorded below; every inlined dependency has not been independently reconciled.
- 0 npm name/version pairs have unknown license declarations; 0 lack a standalone packaged license text by this filename inventory.
- A separate dev.15 native-source bundle contains 1,308 files, including the allowlisted source archives, fixed recipes, patches, provenance and notices. Its SHA-256 is `a028789f18a8277a5e09bab75fa39507c68d9e1aaa6827de0a84d4b824308f57`. Exact original toolchain identification, native rebuild/relink testing, final distribution-license review and a public source download route remain incomplete.
- The bridge's MIT selection is complete. Public repository/release creation remains a separate user decision; no publication was performed.

## Windows native compatibility evidence

The native package manifest specifies `win32`, `x64`, and Node `>=20.9.0`. Static PE header inspection recorded the architectures below; no binary was loaded. Windows ARM64, macOS, and actual installation/load compatibility are not verified by this review.

| Archive-relative binary | Bytes | PE architecture | SHA-256 |
| --- | ---: | --- | --- |
| `node_modules/@img/sharp-win32-x64/lib/libvips-42.dll` | 19018240 | AMD64 (0x8664) | `06dab07cc386748513337a31672b1d5269fbc770a14ff403080575665bf0813f` |
| `node_modules/@img/sharp-win32-x64/lib/libvips-cpp-8.18.7.dll` | 333312 | AMD64 (0x8664) | `25001dbd05305a0a29119ab49933622c70b4a20ea12ef1d5d20ca40181db53bf` |
| `node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64-0.35.5.node` | 443904 | AMD64 (0x8664) | `971048779f9c8598df14641dfc03c625885c93f473a788e65ca2deb50d0b083e` |

## Actual packaged runtime dependencies

Paths below are archive-relative. The JSON report preserves all package manifests, notice hashes, and missing-instance details. `DECLARED_LICENSE_TEXT_MISSING` means no standalone license/copying-named file was identified for an instance; a declaration or source comment is not assumed to satisfy every requirement.

| Package | Version | Declared SPDX | Packaged license / notice paths |
| --- | --- | --- | --- |
| `@hono/node-server` | 2.1.3 | `MIT` | `node_modules/@hono/node-server/LICENSE` |
| `@img/colour` | 1.1.0 | `MIT` | `node_modules/@img/colour/LICENSE.md` |
| `@img/sharp-win32-x64` | 0.35.5 | `Apache-2.0 AND LGPL-3.0-or-later` | `node_modules/@img/sharp-win32-x64/LICENSE`<br>`node_modules/@img/sharp-win32-x64/README.md` (native license labels only) |
| `@modelcontextprotocol/ext-apps` | 1.3.2 | `MIT` | `node_modules/@modelcontextprotocol/ext-apps/LICENSE` |
| `@modelcontextprotocol/sdk` | 1.32.1 | `MIT` | `node_modules/@modelcontextprotocol/sdk/LICENSE` |
| `accepts` | 2.0.0 | `MIT` | `node_modules/accepts/LICENSE` |
| `ajv-formats` | 3.0.1 | `MIT` | `node_modules/ajv-formats/LICENSE` |
| `ajv` | 8.20.0 | `MIT` | `node_modules/ajv/LICENSE` |
| `body-parser` | 2.3.0 | `MIT` | `node_modules/body-parser/LICENSE` |
| `bytes` | 3.1.2 | `MIT` | `node_modules/bytes/LICENSE` |
| `call-bind-apply-helpers` | 1.0.2 | `MIT` | `node_modules/call-bind-apply-helpers/LICENSE` |
| `call-bound` | 1.0.4 | `MIT` | `node_modules/call-bound/LICENSE` |
| `content-disposition` | 1.1.0 | `MIT` | `node_modules/content-disposition/LICENSE` |
| `content-type` | 1.0.5 | `MIT` | `node_modules/content-type/LICENSE` |
| `content-type` | 2.1.0 | `MIT` | `node_modules/body-parser/node_modules/content-type/LICENSE`<br>`node_modules/negotiator/node_modules/content-type/LICENSE`<br>`node_modules/type-is/node_modules/content-type/LICENSE` |
| `cookie-signature` | 1.2.2 | `MIT` | `node_modules/cookie-signature/LICENSE` |
| `cookie` | 0.7.2 | `MIT` | `node_modules/cookie/LICENSE` |
| `cors` | 2.8.6 | `MIT` | `node_modules/cors/LICENSE` |
| `cross-spawn` | 7.0.6 | `MIT` | `node_modules/cross-spawn/LICENSE` |
| `debug` | 4.4.3 | `MIT` | `node_modules/debug/LICENSE` |
| `depd` | 2.0.0 | `MIT` | `node_modules/depd/LICENSE` |
| `detect-libc` | 2.1.2 | `Apache-2.0` | `node_modules/detect-libc/LICENSE` |
| `dunder-proto` | 1.0.1 | `MIT` | `node_modules/dunder-proto/LICENSE` |
| `ee-first` | 1.1.1 | `MIT` | `node_modules/ee-first/LICENSE` |
| `encodeurl` | 2.0.0 | `MIT` | `node_modules/encodeurl/LICENSE` |
| `es-define-property` | 1.0.1 | `MIT` | `node_modules/es-define-property/LICENSE` |
| `es-errors` | 1.3.0 | `MIT` | `node_modules/es-errors/LICENSE` |
| `es-object-atoms` | 1.1.2 | `MIT` | `node_modules/es-object-atoms/LICENSE` |
| `escape-html` | 1.0.3 | `MIT` | `node_modules/escape-html/LICENSE` |
| `etag` | 1.8.1 | `MIT` | `node_modules/etag/LICENSE` |
| `eventsource-parser` | 3.1.1 | `MIT` | `node_modules/eventsource-parser/LICENSE` |
| `eventsource` | 3.0.7 | `MIT` | `node_modules/eventsource/LICENSE` |
| `express-rate-limit` | 8.7.1 | `MIT` | `node_modules/express-rate-limit/license` |
| `express` | 5.2.1 | `MIT` | `node_modules/express/LICENSE` |
| `fast-deep-equal` | 3.1.3 | `MIT` | `node_modules/fast-deep-equal/LICENSE` |
| `fast-uri` | 3.1.8 | `BSD-3-Clause` | `node_modules/fast-uri/LICENSE` |
| `finalhandler` | 2.1.1 | `MIT` | `node_modules/finalhandler/LICENSE` |
| `forwarded` | 0.2.0 | `MIT` | `node_modules/forwarded/LICENSE` |
| `fresh` | 2.0.0 | `MIT` | `node_modules/fresh/LICENSE` |
| `function-bind` | 1.1.2 | `MIT` | `node_modules/function-bind/LICENSE` |
| `get-intrinsic` | 1.3.0 | `MIT` | `node_modules/get-intrinsic/LICENSE` |
| `get-proto` | 1.0.1 | `MIT` | `node_modules/get-proto/LICENSE` |
| `gopd` | 1.2.0 | `MIT` | `node_modules/gopd/LICENSE` |
| `has-symbols` | 1.1.0 | `MIT` | `node_modules/has-symbols/LICENSE` |
| `hasown` | 2.0.4 | `MIT` | `node_modules/hasown/LICENSE` |
| `hono` | 4.13.13 | `MIT` | `node_modules/hono/LICENSE` |
| `http-errors` | 2.0.1 | `MIT` | `node_modules/http-errors/LICENSE` |
| `iconv-lite` | 0.7.3 | `MIT` | `node_modules/iconv-lite/LICENSE` |
| `inherits` | 2.0.4 | `ISC` | `node_modules/inherits/LICENSE` |
| `ip-address` | 10.7.3 | `MIT` | `node_modules/ip-address/LICENSE` |
| `ipaddr.js` | 1.9.1 | `MIT` | `node_modules/ipaddr.js/LICENSE` |
| `is-promise` | 4.0.0 | `MIT` | `node_modules/is-promise/LICENSE` |
| `isexe` | 2.0.0 | `ISC` | `node_modules/isexe/LICENSE` |
| `jose` | 6.2.12 | `MIT` | `node_modules/jose/LICENSE.md` |
| `json-schema-traverse` | 1.0.0 | `MIT` | `node_modules/json-schema-traverse/LICENSE` |
| `json-schema-typed` | 8.0.2 | `BSD-2-Clause` | `node_modules/json-schema-typed/LICENSE.md` |
| `math-intrinsics` | 1.1.0 | `MIT` | `node_modules/math-intrinsics/LICENSE` |
| `media-typer` | 1.1.1 | `MIT` | `node_modules/media-typer/LICENSE` |
| `merge-descriptors` | 2.0.0 | `MIT` | `node_modules/merge-descriptors/license` |
| `mime-db` | 1.54.0 | `MIT` | `node_modules/mime-db/LICENSE` |
| `mime-types` | 3.0.2 | `MIT` | `node_modules/mime-types/LICENSE` |
| `ms` | 2.1.3 | `MIT` | `node_modules/ms/license.md` |
| `negotiator` | 1.1.0 | `MIT` | `node_modules/negotiator/LICENSE` |
| `object-assign` | 4.1.1 | `MIT` | `node_modules/object-assign/license` |
| `object-inspect` | 1.13.4 | `MIT` | `node_modules/object-inspect/LICENSE` |
| `on-finished` | 2.4.1 | `MIT` | `node_modules/on-finished/LICENSE` |
| `once` | 1.4.0 | `ISC` | `node_modules/once/LICENSE` |
| `parseurl` | 1.3.3 | `MIT` | `node_modules/parseurl/LICENSE` |
| `path-key` | 3.1.1 | `MIT` | `node_modules/path-key/license` |
| `path-to-regexp` | 8.4.2 | `MIT` | `node_modules/path-to-regexp/LICENSE` |
| `pkce-challenge` | 5.0.1 | `MIT` | `node_modules/pkce-challenge/LICENSE` |
| `playwright-core` | 1.62.1 | `Apache-2.0` | `node_modules/playwright-core/lib/serverRegistry.js.LICENSE`<br>`node_modules/playwright-core/lib/utilsBundle.js.LICENSE`<br>`node_modules/playwright-core/lib/webp_codec.LICENSE`<br>`node_modules/playwright-core/LICENSE`<br>`node_modules/playwright-core/NOTICE`<br>`node_modules/playwright-core/ThirdPartyNotices.txt` |
| `proxy-addr` | 2.0.8 | `MIT` | `node_modules/proxy-addr/LICENSE` |
| `qs` | 6.16.0 | `BSD-3-Clause` | `node_modules/qs/LICENSE.md` |
| `range-parser` | 1.3.0 | `MIT` | `node_modules/range-parser/LICENSE` |
| `raw-body` | 3.0.2 | `MIT` | `node_modules/raw-body/LICENSE` |
| `require-from-string` | 2.0.2 | `MIT` | `node_modules/require-from-string/license` |
| `router` | 2.2.0 | `MIT` | `node_modules/router/LICENSE` |
| `safer-buffer` | 2.1.2 | `MIT` | `node_modules/safer-buffer/LICENSE` |
| `semver` | 7.8.5 | `ISC` | `node_modules/semver/LICENSE` |
| `send` | 1.2.1 | `MIT` | `node_modules/send/LICENSE` |
| `serve-static` | 2.2.1 | `MIT` | `node_modules/serve-static/LICENSE` |
| `setprototypeof` | 1.2.0 | `ISC` | `node_modules/setprototypeof/LICENSE` |
| `sharp` | 0.35.5 | `Apache-2.0` | `node_modules/sharp/LICENSE` |
| `shebang-command` | 2.0.0 | `MIT` | `node_modules/shebang-command/license` |
| `shebang-regex` | 3.0.0 | `MIT` | `node_modules/shebang-regex/license` |
| `side-channel-list` | 1.0.1 | `MIT` | `node_modules/side-channel-list/LICENSE` |
| `side-channel-map` | 1.0.1 | `MIT` | `node_modules/side-channel-map/LICENSE` |
| `side-channel-weakmap` | 1.0.2 | `MIT` | `node_modules/side-channel-weakmap/LICENSE` |
| `side-channel` | 1.1.1 | `MIT` | `node_modules/side-channel/LICENSE` |
| `statuses` | 2.0.2 | `MIT` | `node_modules/statuses/LICENSE` |
| `toidentifier` | 1.0.1 | `MIT` | `node_modules/toidentifier/LICENSE` |
| `type-is` | 2.1.0 | `MIT` | `node_modules/type-is/LICENSE` |
| `unpipe` | 1.0.0 | `MIT` | `node_modules/unpipe/LICENSE` |
| `vary` | 1.1.2 | `MIT` | `node_modules/vary/LICENSE` |
| `which` | 2.0.2 | `ISC` | `node_modules/which/LICENSE` |
| `wrappy` | 1.0.2 | `ISC` | `node_modules/wrappy/LICENSE` |
| `zod-to-json-schema` | 3.25.2 | `ISC` | `node_modules/zod-to-json-schema/LICENSE` |
| `zod` | 4.6.5 | `MIT` | `node_modules/zod/LICENSE` |

## Native components declared in the packaged Sharp binary package

Versions come from `node_modules/@img/sharp-win32-x64/versions.json`; labels come from the packaged README license table. Original label wording and links are retained as evidence; they are not normalized to SPDX or treated as a complete license bundle. Aliases such as `vips` → `libvips` only match the README names.

| Component | Packaged version | README license label |
| --- | --- | --- |
| `aom` | `3.15.1` | BSD 2-Clause + [Alliance for Open Media Patent License 1.0](https://aomedia.org/license/patent-license/) |
| `archive` | `3.8.9` | libarchive — BSD 2-Clause; exact-version COPYING retained |
| `cairo` | `1.18.6` | Mozilla Public License 1.1 |
| `cgif` | `0.5.4` | MIT License |
| `exif` | `0.6.26` | LGPLv3 |
| `expat` | `2.8.5` | MIT License |
| `ffi` | `3.8.0` | MIT License |
| `fontconfig` | `2.18.3` | [fontconfig License](https://gitlab.freedesktop.org/fontconfig/fontconfig/blob/main/COPYING) (BSD-like) |
| `freetype` | `2.14.3` | [freetype License](https://git.savannah.gnu.org/cgit/freetype/freetype2.git/tree/docs/FTL.TXT) (BSD-like) |
| `fribidi` | `1.0.17` | LGPLv3 |
| `glib` | `2.90.0` | LGPLv3 |
| `harfbuzz` | `14.5.0` | MIT License |
| `heif` | `1.23.5` | LGPLv3 |
| `highway` | `1.4.0` | BSD 3-Clause |
| `imagequant` | `2.4.1` | lovell/libimagequant BSD 2-Clause fork; exact-version COPYRIGHT retained |
| `lcms` | `2.19.1` | MIT License |
| `mozjpeg` | `0826579` | [zlib License, IJG License, BSD 3-Clause](https://github.com/mozilla/mozjpeg/blob/master/LICENSE.md) |
| `pango` | `1.58.2` | LGPLv3 |
| `pixman` | `0.46.4` | MIT License |
| `png` | `1.6.58` | [libpng License](https://github.com/pnggroup/libpng/blob/master/LICENSE) |
| `proxy-libintl` | `0.5` | LGPLv3 |
| `rsvg` | `2.63.2` | LGPLv3 |
| `tiff` | `4.7.2` | [libtiff License](https://gitlab.com/libtiff/libtiff/blob/master/LICENSE.md) (BSD-like) |
| `uhdr` | `2.0.2` | MIT License |
| `vips` | `8.18.7` | LGPLv3 |
| `webp` | `1.6.0` | New BSD License |
| `xml2` | `2.15.4` | MIT License |
| `zlib-ng` | `2.3.3` | [zlib License](https://github.com/zlib-ng/zlib-ng/blob/develop/LICENSE.md) |

The historical detailed dev.8 evidence remains private. Public machine-readable declarations are in [npm package inventory](../third_party/npm-packages.json), and exact native source hashes and notices are in [native materials](../third_party/native/README.md). These inventories do not claim all attribution requirements are complete.
