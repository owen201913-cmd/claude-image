# Claude Image

[![M8ven Score](https://m8ven.ai/badge/mcp/owen201913-cmd-claude-image-g1apu7?v=0b6a1413f02368fc2c7f1b416ef72e32)](https://m8ven.ai/mcp/owen201913-cmd-claude-image-g1apu7?s=readme)

Describe a scene in Claude Desktop chat, generate one image, and preview or download the original in the same conversation. Website operations run in the background by default. Basic use needs no API key, additional account, or manual prompt copying.

[Download Claude Image 0.1.0](https://github.com/owen201913-cmd/claude-image/releases/tag/v0.1.0) · [Traditional Chinese](README.zh-TW.md) · [MIT license](LICENSE)

## Install

1. Use **Windows x64**, **Claude Desktop 2.26454.2 or newer**, and a standard installation of **Microsoft Edge or Google Chrome**. Claude must support MCP Apps image display and file downloads; not every newer version has been tested.
2. Download the `.mcpb` installer from [Release → Assets](https://github.com/owen201913-cmd/claude-image/releases/tag/v0.1.0). **Code → Download ZIP** and **Source code (zip)** are development source, not installable extensions.
3. Double-click the MCPB or drag it into Claude Desktop, then complete Claude's installation and permission prompts. No separate Node installation, npm command, or JSON editing is needed. The matching `.sha256` file is available for verification.
4. Leave **Visible browser** and **Diagnostic fixture** off. In a new ordinary chat ask:

   > Draw a cat sleeping beside a spaceship window.

5. Click the image to download the original and complete Claude's download confirmation.

## Use

**Keep prompts short.** Use one direct scene description, such as “A cabin in the rain.” Long prompts may lead to misunderstandings or generation errors. Your language and explicit requirements are preserved; English is optional, and no unrequested style is added. Asking only for a prompt does not generate an image.

Each explicit generation request makes one submission, targeting one delivered image. Only one task runs at a time. Timeouts and delivery failures reuse the existing task instead of automatically generating again.

The daily free allowance is **estimated at 5–10 generations**, subject to the service's current rules and availability. The extension does not provide extra credits, make payments, or bypass limits. Quota exhaustion, human verification, refusal, or login requirements stop the task with a message.

For image-only replies on success, follow the optional [image-reply setup](docs/image-only-setup.md) to append account Instructions. The MCPB does not apply them automatically. Claude may still add text or display its own tool and permission interface. Images use a minimal MCP App; click the image to download the unchanged original.

## Data and limitations

This is an unofficial extension. Image descriptions are sent to Ngini for processing; see [privacy](PRIVACY.md). It does not automatically send entire chats, read ordinary-browser data, or collect telemetry. Original bytes are preserved, and uninstalling the extension does not delete saved images.

Tested on an existing Windows 11 x64 installation. macOS, ARM64, web, and mobile clients are unsupported. Image-only replies have one successful sample and are not guaranteed on every turn. See [0.1.0 release notes](docs/release-0.1.0.md) for details.

## Development

Use Node >=24.15.0 and pnpm 11.19.0. The bundle uses Claude's Node runtime >=20.9.0.

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm run test:protocol
pnpm run verify:release
```

Normal tests and CI use offline fixtures and controlled pages, without consuming generation credits. Prepare matching materials using the [native-source instructions](third_party/native/SOURCE_ACCESS.md) before running `pnpm run package`.

Code is [MIT licensed](LICENSE); dependencies retain their own licenses. Image usage rights depend on the service's terms.

[Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Testing](docs/testing.md) · [Changelog](CHANGELOG.md)

Maintained by [Yutou](https://github.com/owen201913-cmd).
