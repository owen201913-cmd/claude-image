# Security

This unofficial bridge exposes only generation, result retrieval, cancellation and image-card delivery operations. It exposes no arbitrary shell, JavaScript, URL downloader or filesystem browser to Claude. Website content is untrusted data and must not become instructions to access files, change settings or transmit chat history.

A dedicated persistent browser profile is used. Headless mode is a visibility option, not an access-control workaround. Chromium sandboxing remains enabled. No identity reset, proxy rotation, CAPTCHA bypass, account sharing, payment flow or automatic regeneration is implemented.

Image input is restricted to bounded raster originals (PNG/JPEG/WebP, 25 MiB, 64 million pixels). Generated identifiers map to tool-owned files; previews are separate. Original download is chunked, bounded and SHA-256 checked. A client accepting a download does not by itself prove the user saved the original. Errors retain their actual stage.

User runtime state, browser profiles, generated images, private diagnostics and secrets are excluded from source/package allowlists. Compiled application modules are included through an explicit reviewed list; unexpected build leftovers stop packaging. The actual staging paths and own staged text are checked before creating the MCPB. `pnpm run verify:release` checks the allowed first-party files for private-key/token patterns and developer home paths. This bounded scan is not a guarantee that every possible secret or third-party vulnerability is absent.

The server uses stdio. It does not expose a public debug port or unauthenticated local image web server. Normal installation needs no administrator privilege. Settings and trust prompts remain under the user's control.

Report a suspected issue privately to the project owner through an existing trusted channel. Do not include tokens, cookies, personal prompts or private generated images in public issues. No security contact address or response SLA is invented by this project.
