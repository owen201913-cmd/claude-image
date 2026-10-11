# Modify or replace the Windows native libraries

Work on your own source checkout or unpacked extension copy, with its MCP
process stopped. Preserve your generated images and dedicated browser profile.
The bridge's MIT terms do not forbid modification, replacement or reverse
engineering to debug library modifications where the applicable LGPL allows it.
No signature check in the bridge prevents using your modified local library.

The runtime files are ordinary files under
`node_modules/@img/sharp-win32-x64/lib/`: `libvips-42.dll`,
`libvips-cpp-8.18.7.dll` and `sharp-win32-x64-0.35.5.node`. In a pnpm development
checkout these can be links into a shared store: copy the complete dependency
assembly first; do not edit that store to test a separate installation.

## Build route

1. Obtain the exact source versions and build inputs listed in
   [SOURCE_ACCESS.md](SOURCE_ACCESS.md) and [source-access.json](source-access.json).
   The fixed upstream build-win64-mxe source must be obtained separately.
2. Follow its fixed README/build.sh for the Windows x64 **web/static** target,
   modifying the intended library sources while retaining required notices.
   libvips itself is a shared DLL; dependencies may be statically included
   inside it. Original container digest/toolset identity is not verified here.
3. Rebuild Sharp's MSVC C++ bridge/addon with compatible headers, the Windows
   `libvips.lib` import input and the five matching libvips C++ sources. The
   fixed [Sharp binding.gyp](https://github.com/lovell/sharp/blob/51a990faa26ade5586a4934ac9673c98d8893326/src/binding.gyp)
   describes the Windows linkage. Exact input hashes/paths are in
   [Sharp provenance](provenance/sharp-provenance.json). If you change public
   C++ ABI, rebuild the addon using that ABI too.
4. Sharp's [official build prerequisites](https://sharp.pixelplumbing.com/install/#building-from-source)
   include a C++17 compiler, node-addon-api/node-gyp and their requirements;
   `npm explore sharp -- npm run build` is its documented build command.
   Global custom libvips detection is not supported on Windows. Use the
   version-specific Windows assembly inputs rather than assuming Linux global
   library instructions work here.
5. Put the compatible rebuilt files in the isolated assembly, start a fresh
   Node process and run PNG/JPEG/WebP decoding before installing your copy.
   Keep an unmodified backup to restore that copy on failure.

The official Windows libvips ZIP's MinGW `libvips-cpp-42.dll` cannot simply be
renamed to the MSVC `libvips-cpp-8.18.7.dll`: all 109 named C++ exports required
by the packaged Sharp addon differ. That attempted substitution was tested in
an isolated assembly and failed to load as expected.

## What was actually tested

`node scripts/native-replacement-smoke.mjs --out <local-report.json>` copies the
dependency assembly and production validator into a temporary directory. It
tests baseline three-format decoding, missing bridge/main DLL failure controls,
the incompatible official alternate bridge, then restoration and three-format
decoding. Actual loaded modules are checked to reside in the temporary assembly;
the installed/original files stay unchanged. The local verified official ZIP
and built validator are prerequisites, with no network performed by the smoke.

The five assembly cases passed. A native compilation of a modified compatible
DLL and user-installed replacement are **NOT_RUN**; compiler/toolchain setup is
not performed by this project. This documented assembly/rebuild route is not a
claim of a bit-identical upstream rebuild or a legal guarantee.
