# GitHub 發布準備

目前來源：**0.1.0**。專案採 MIT，原生依賴另保留通知、來源與替換條件。尚未建立公開 repository 或 release；本文件是維護者操作說明，不是已發布宣告。乾淨 Windows 已由擁有者決定免測，限制見 [本版驗收](acceptance-0.1.0.md)。

## 下載與安裝的分工

使用者應從 **Releases → Assets** 取得同版 `.mcpb`，雙擊或拖入 Claude Desktop，完成它的正常權限確認。GitHub 自動 Source code ZIP 及 Code → Download ZIP 是開發來源，不能直接安裝。日常使用不要求 Node／npm／API key。

`.github/workflows/offline.yml` 僅執行離線建置、受控測試、fixture stdio、來源檢查，不自動打包或發布、不存取生圖額度。人工發布是刻意採用的流程，沒有自動發布 workflow 不表示安裝包不存在。

## 維護者本機產物

1. 依 README 開發指令安裝鎖定依賴、建置、測試、stdio 與來源檢查。
2. 依 third_party/native/SOURCE_ACCESS.md 準備／驗證原生材料；執行 `pnpm run package`。只在 Windows x64 打包，拒絕覆寫已封存版本，明確清單只收必要編譯檔。
3. 執行嚴格 CSP 及 `scripts/verify-candidate.py`，核對實際 zip bytes、原生檔、guarded entry；使用獨立目錄驗證，不能依賴開發 node_modules。
4. `node scripts/export-github.mjs --out release/github-ready-0.1.0` 建立白名單來源目錄，再使用 `scripts/archive-github.py`／`scripts/package-source.py` 封存來源；`scripts/package-native-source.py` 封存同版原生來源。每份保留 SHA-256，固定歷史產物不覆寫。

匯出器不含 profile、私圖、request state、除錯 JSON、下載、快取、node_modules、dist、release 或尚未確認獨立再散布授權的上游 recipes。JSON 本機診斷不會自動公開，頂層公開 Markdown 包含必要測試摘要。公開前檢查匯出清單，不能直接把整個工作資料夾推上去。

## 擁有者授權後的人工 Release

- 使用乾淨來源匯出建立 Git repository、commit 與版本 tag；不是推整個開發資料夾。未授權時不執行遠端建立、push 或 release。
- 同一 Release 附 `ngini-image-bridge-0.1.0-win32.mcpb` 與 `.sha256`、`-source.zip` 與 `.sha256`、`-native-source.zip` 與 `.sha256`，以及同版驗證／已知問題說明。
- native-source 大於一般 Git 的 100 MiB 限制，以 Release Assets 分發。[GitHub 大型檔案說明](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)。
- 公開後才填真實 repository／release／source asset 網址，逐一 HTTPS 下載比對 SHA，維持來源可取得。不可預造網址或把私人 cache 當公開來源。
- 讓使用者下載 `.mcpb`；不要把自動 Source code ZIP 標成外掛安裝包。[GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)、[Claude MCPB](https://claude.com/docs/connectors/building/mcpb)。

## 已揭露的測試範圍

乾淨 Windows 生命週期 **NOT_RUN_USER_WAIVED**；正式版沒有新增真實生成，沿用未改生成行為的歷史實機證據，live 預算 0。只圖片回覆須另外保存帳號 Instructions，已驗證單一圖片樣本，不保證每回合或版本。公開下載與託管 CI **NOT_RUN**；只有在擁有者授權公開後才執行。不把免測、匯出或封裝成功寫成實機 PASS。
