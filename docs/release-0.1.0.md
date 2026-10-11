# Claude Image 0.1.0

2026-10-12 · Windows x64 · MIT

Generate one image from a short scene description in ordinary Claude Desktop chat. Background generation, in-chat preview, and original downloads have actual-host samples. Claude Image is an unofficial extension; see [privacy](../PRIVACY.md) for data processing and storage.

## Downloads

- [Public repository](https://github.com/owen201913-cmd/claude-image)
- [Stable release v0.1.0](https://github.com/owen201913-cmd/claude-image/releases/tag/v0.1.0)

| Asset | Purpose |
| --- | --- |
| `ngini-image-bridge-0.1.0-win32.mcpb` | Claude Desktop installer for Windows x64 |
| `ngini-image-bridge-0.1.0-source.zip` | Matching application source, tests, locked dependencies, MIT license, and third-party notices |
| `ngini-image-bridge-0.1.0-native-source.zip` | Matching native dependency source, notices, and source-access instructions |
| Matching `.sha256` files | SHA-256 checksums of the actual asset bytes |

Asset filenames retain the original package identifier; the interface is named **Claude Image**. To install, download the `.mcpb`. GitHub's automatic **Source code (zip)** is not an installable extension. The binary, matching application source, and native source are distributed together; see [native-source access](../third_party/native/SOURCE_ACCESS.md).

To verify the installer in Windows PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath '.\ngini-image-bridge-0.1.0-win32.mcpb'
```

Compare the result with the matching downloaded `.sha256` file. A filename alone does not prove version or integrity.

## Installation and use

Use Windows x64, Claude Desktop with MCP Apps file-download support, and a standard installation of Edge or Chrome. Double-click the installer, complete Claude's normal confirmations, then ask in ordinary chat: “Draw a cabin in the rain.” Click the result to download the original. Basic use requires no API key, additional account, separate Node installation, or administrator permission.

Each explicit generation request makes one submission. Timeouts and delivery retries query the same task without automatically generating again. Keep descriptions short; your language and explicit requirements are preserved. The daily free allowance is estimated at 5–10 generations, subject to the service's current rules and availability.

## Tested scope and limitations

- Background generation, an ordinary-chat image card, and original downloads have actual-host evidence. The card is a minimal MCP App, not a native image attachment.
- Version 0.1.0 retains RC12 functionality. The historical controlled suite passed **332/332 tests and 54/54 suites**. The 0.1.0 build and one targeted CSP check of its exact UI artifact passed; the full suite was not rerun and no new live generation was submitted for release preparation.
- Image-only replies require separately choosing the optional [account Instructions](image-only-setup.md). The MCPB does not apply them automatically. One image-only turn and three controls requiring text passed; this does not guarantee text-free replies on every turn. Claude's own tool and permission interface may remain visible.
- Tested on an existing Windows 11 x64 installation. macOS, ARM64, web, and mobile clients are unsupported.
- Quota exhaustion, human verification, refusal, changed website UI, or login requirements stop the task. No payments or limit bypass are implemented.

See [release acceptance](acceptance-0.1.0.md), [compatibility](compatibility.md), and [image-reply setup](image-only-setup.md) for detailed evidence and exceptions.

## Source and license

The public source export excludes user profiles, private images, runtime records, test Windows images, node_modules, and historical installers. Public documentation edits do not change the already packaged 0.1.0 executable bytes.

Code is [MIT licensed](../LICENSE); dependencies retain their own licenses. This does not imply official affiliation or guarantee commercial rights to generated images. See [contributing](../CONTRIBUTING.md).

Maintained by [Yutou](https://github.com/owen201913-cmd). The GitHub login and repository URL remain `owen201913-cmd/claude-image`.
