# RC12 acceptance — result-time response contract

2026-10-12 Asia/Taipei. Test candidate, formal acceptance NOT_PASSED. No live generation in this work.

RC12 keeps RC11's valid card payload and adds a short, server-owned reply instruction to successful single-image App results. This is a model-behavior trial; it cannot enforce silent assistant turns. Error/pending/quota/multiple-result cases retain actionable output.

| Check | Result | Evidence / scope |
|---|---|---|
| Changed contract tests | PASS | Historical focused run: 29/29 after correcting one new test setup; subsequent full run recorded separately below |
| Full controlled RC12 suite | PASS | [One single-worker run](test-results-rc12-single-worker-20261012.json): 332/332 tests, 54/54 suites, zero failed/pending, about 40.9 seconds; all three browser flags and fixture mode, unchanged 20-second timeout, zero live generation |
| Build | PASS | One compilation/UI build, exit 0 |
| Compiled MCP App protocol | PASS | [6 checks](protocol-app-card-rc12.json); isolated fixture, no browser/live/Claude host |
| Candidate package | PASS | Official schema validation/package; 18,218,016 bytes, SHA-256 `8fbdae4ed10877010ae0edfc50bd221046940d5702635aefeca74eb410f90101`; archive read-back not rerun |
| Installed changed contract | PASS | [Manifest + changed artifact](desktop-contract-install-rc12.json); only that scope |
| New ordinary-chat existing-image preview | PASS | [One visible card](host-existing-cat-reopen-rc12.json), automatically selected status + result tools |
| Strict image-only completed turn | FAIL | [Completed turn](host-existing-cat-reopen-rc12.json) adds two prose paragraphs; the short reply instruction was visible in the actual tool inspector |
| Optional account skill upload and enable | PASS | [Actual Claude UI](host-existing-cat-reopen-skill-rc12.json); separate from the MCPB, human-approved |
| Actual skill loading in that turn | NOT_OBSERVED | Upload/enable is not evidence of loading; no claim that loaded rules were ignored |
| Optional skill first ordinary-chat preview | PASS | [One existing-cat card](host-existing-cat-reopen-skill-rc12.json); no new generation |
| Optional skill strict image-only turn | FAIL | [First completed turn](host-existing-cat-reopen-skill-rc12.json) still added a caption; hypothesis stopped after this failure, other skill cases NOT_RUN |
| Optional account Instructions saved | PASS | [Actual save and one existing-image trial](host-existing-cat-reopen-instructions-rc12.json); optional account-wide setting, not automatically applied by the MCPB; [setup/removal](image-only-setup.md) |
| Instructions strict image-only sample | PASS | One new ordinary-chat completed turn with a correct existing-cat card and no additional assistant body; no per-turn silence instruction, no new generation; not a deterministic guarantee |
| Instructions controls | PASS | Three controls for source question, ordinary arithmetic and missing task retained necessary text; raw tool error code NOT_OBSERVED |
| Fresh host original save | NOT_RUN | No RC12 fresh save yet; old saves are historical |
| Native media index review | PASS | [Root review of saved actual DISM output](native-media-review-20261012.json) confirms the sole zh-TW index 1; original parser BLOCKED retained, not relabeled PASS |
| Native offline Phase A | PASS | [Actual existing-VHDX resume result](native-raw-resume-result-20261012.json): OFFLINE_IMAGE_PREPARED_NOT_BOOTED, same 80 GiB VHDX, image applied, three static guest files bytes/SHA matched, access path removed, ISO/VHDX detached, no unknown/retained state or second VHDX. Early 2026-10-12 [preparation snapshot](native-stage-preparation-20261012.json) predates VHDX creation; it and the later original Stage failure remain historical |
| Clean Windows P4 | BLOCKED | Actual acceptance NOT_RUN_NOT_WAIVED: Windows has not booted; clean Claude install/update/restart/uninstall NOT_RUN. No BCD/EFI or security change, reboot or emulator action; completed offline preparation is not P4 PASS |
| GitHub publication | NOT_RUN | No public repo or release created |

The sealed RC12 test package predates current documentation and this report, and includes older README/changelog snapshots. The file is immutable; read this current report for RC12 scope. It is not a formal distribution.

B trial uses the same natural-language reopen request as the historical RC11 trial, in a new ordinary chat, without a tool name or an extra instruction to suppress prose. Historical RC11 is a reference, not a randomized A/B control. A full finished turn with one correct visible card and no assistant caption is required. Any caption, duplicate or missing card is FAIL. This probe must never submit a new generation.

The optional companion skill was separately uploaded and enabled in the user's Claude account. Its first natural existing-image reopen failed strict image-only acceptance, while actual skill loading was NOT_OBSERVED. This does not prove that loaded instructions were ignored or establish deterministic future behavior. The trial made zero new Ngini submissions; fresh saves, normal-question/error cases and clean Windows acceptance were not run. The hypothesis stops after this first failure, without further caption tuning. These are post-freeze supplements; the MCPB and historical reports remain unchanged.

The separate account Instructions setting was subsequently saved, and one completed existing-image turn plus three controls passed. The earlier minimized-window handoff is historical and was later resolved; it is not the current application state. This optional setting affects every chat, requires each installer's separate choice and preserves existing instructions. It does not prove automatic MCPB behavior or host-enforced silence, reclassify the earlier contract/Skill FAIL, or provide fresh original-download evidence. The [trial](response-instructions-trial.md) and [setup guide](image-only-setup.md) record those limits.

The new full-suite PASS is a source/configuration validation supplement after the sealed MCPB, not a repackaging claim. The timeout remained 20 seconds and only the worker limit changed to one. The earlier RC11 327/328 FAIL remains preserved; resource contention is an inference, not an established unique cause. All new reports and current documentation are separate from immutable candidate artifacts.
