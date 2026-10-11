# 測試與驗收

目前正式版本為 **0.1.0**，功能實作沿用 RC12，只更新發行標籤／manifest／文件。本輪不重跑完整 suite、不再進行 Windows 驗收或 Ngini 生成。[正式驗收](acceptance-0.1.0.md) 分別記錄沿用證據、未測項目與擁有者接受的例外；這不是所有原始案例都通過的宣稱。

| 範圍 | 判定與證據 |
| --- | --- |
| RC12 完整受控 suite | [332/332 tests、54/54 suites PASS](test-results-rc12-single-worker-20261012.json)：單 worker、原 20 秒 timeout、三項 browser flags／fixture 開啟，約 40.9 秒、0 failed／pending／真實生成。正式版沿用，未重跑 |
| 0.1.0 建置／精確 UI | build PASS、單項精確 UI CSP 檢查 PASS；其餘兩項 CSP 案例未重跑，範圍另列交付索引 |
| RC12 聚焦／編譯 App 協定 | 原聚焦 29/29 PASS、[compiled stdio 6 checks PASS](protocol-app-card-rc12.json)；不是 Claude UI／live 證據 |
| 背景生成與原圖交付 | 下方歷史實機樣本分開記錄新生成、正確關聯、圖片卡片及原檔 SHA／完整解碼；本輪沒有新生成或保存驗收 |
| MCPB 單獨嚴格只圖片 | [RC12 普通聊天](host-existing-cat-reopen-rc12.json) 預覽 PASS、附加兩段文字 FAIL；原報告不改寫 |
| 獨立帳號 Instructions | [保存設定後 1 個完整既有圖回合 PASS](host-existing-cat-reopen-instructions-rc12.json)，來源問題／普通問答／查無任務 3 個控制 PASS；原始錯誤碼 NOT_OBSERVED。單樣本，不保證每回合 |
| 乾淨 Windows P4 | **NOT_RUN_USER_WAIVED**，2026-10-12 擁有者放棄繼續 Windows 測試。原生 VHDX 曾遇到 `0x7B` 並返回原 Home；乾淨 Claude 安裝／更新／重啟／移除仍未驗收，見 [例外](native-qa-waiver-20261012.md) |
| 目前 live 預算 | **0 次**；本輪新增提交 0。歷史累計 7 次可能耗額提交、5 份不同原圖、2 份場景相符，不等於生成 7 張 |

帳號 Instructions 必須依 [設定與撤回](image-only-setup.md) 另行選擇套用 [文字檔](../companion-instructions/ngini-image-replies.txt)，不是 MCPB 自動載入。可選帳號 Skill 的原試驗仍 FAIL、實際載入 NOT_OBSERVED，不能改稱已載入規則被忽略。

以下是版本分項歷史與測試方法。「未豁免」等舊時點敘述保留為歷史，現行 P4 決定以上表為準。舊 FAIL／NOT_RUN 報告及封存來源不覆寫；未執行項目不改成 PASS。現有主機生命週期、host log、GitHub 下載／託管 Actions 等缺少實機證據的項目仍維持 NOT_RUN。

## RC11 歷史驗收

[RC11 驗收](acceptance-rc11.md) 保留該版及更早證據。首次完整受控 suite **23 files／327 PASS／1 FAIL**（CSP 原 20 秒逾時）；相同 timeout、單 worker 的受影響檔重測 **3/3 PASS**，首次 FAIL 原樣保留，不能寫成單次完整 suite 全通過。

RC11 建置、來源／封包 App stdio、封包完整性、隔離來源重建 28/28 runtime 與現有主機安裝核對 PASS。[2026-10-10 新普通聊天](host-existing-cat-reopen-rc11.json) 自動查詢一次同一張既有貓圖，單一圖片可見；[新保存原檔](host-cat-original-download-rc11.json) bytes／SHA／完整解碼 PASS；[任務比較](host-request-state-rc11.json) 9→9、沒有新增提交。**嚴格只圖片 FAIL**：Claude 仍附加一句文字。乾淨 Windows **BLOCKED、未豁免**；本版新生成 NOT_RUN，live 預算 0。結果統一 PASS／FAIL／BLOCKED／NOT_RUN；模擬、實機及 live 分開，私密診斷不公開。

2026-10-12 新增 [installed served-resource 核對](installed-resource-inspection-rc11-20261012.json) **PASS**：2026-10-12 以 installed RC11 的隔離 stdio client 執行 readResource，HTML SHA-256 與既有 RC11 CSP 證據相符；5 項 App tools／2 項 ordinary tools、app-only visibility PASS，0 callTool／browser／新增 jobs／live。這不是實際 Claude iframe，也沒有新增 host 預覽或下載驗收。

VM 路線的歷史 RAM 測量一次：2026-10-11T16:33:59.0428867Z（台北 2026-10-12 00:33:59），可用 2.82 GiB／總計 15.589 GiB；4 GiB 的專用 VM 保持關機。6 GiB 可用記憶體是本專案保守餘裕閘門，不是 Windows 官方最低要求。保留使用者的 Android 模擬器；P4 未豁免，不把此歷史收據當成 native VHDX preflight 或 RC12 測試。

[RC9 T02](host-prompt-only-rc9.json) 一個新普通聊天 PASS：只回一句中文提示詞、沒有可見 tools／權限提示，own records 9→9 且 ID／提交／image identity／source 未變、新增 live 0；raw host RPC 未追蹤，不是全部意圖保證。

## 離線指令

```sh
pnpm run build
pnpm test
pnpm run test:protocol
pnpm run verify:release
```

完整受控瀏覽器測試設 `NGINI_SESSION_BROWSER_TEST=1`、`NGINI_CSP_BROWSER_TEST=1`、`NGINI_DOM_BROWSER_TEST=1`。只使用本機／攔截頁面，不向 Ngini 生圖。CI 同樣開啟三項，沒有 live 或發布權限。MCP 正常模式 7 tools、明確 fixture 模式 8 tools；協定／精確 HTML／CSP 都不能取代 Claude 實機。

歷史 RC6 完整結果見 [審查與執行報告](rc6-audit-resolution.md)。封包後使用 `python scripts/verify-candidate.py --outside-tree` 讀回每個 archive 檔，再執行 `node scripts/isolated-bundle-smoke.mjs`。實際 MCPB 在 TEMP／空 PATH 與 NODE_PATH／包外 Node module 拒絕器下測正常協定、fixture 去重／原檔／重啟；修正 harness 後的本機頁冷啟動另用僅含 System32 的 PATH、production 預設 30 秒。仍使用既有 OS、Node、瀏覽器與系統函式庫，**不是乾淨 Windows**。

新報告拒絕覆寫舊報告。只診斷 browser 可加 `--browser-only --cold-starts=3 --report=docs/new-run.json`；`--dns-block` 是額外診斷條件，不能混充正常模式。RC5 首次 browser child 80 秒逾時 FAIL、根因未知；之後正常條件 3/3 本機頁冷啟動 PASS，分開保留，詳見歷史 [RC5 報告](rc5-audit-resolution.md)。

## 核心案例

正式版逐項狀態與例外見 [0.1.0 驗收](acceptance-0.1.0.md)；[RC12 驗收表](acceptance-rc12.md)、[RC11 驗收表](acceptance-rc11.md)、[RC9 驗收表](acceptance-rc9.md)、[RC8 驗收表](acceptance-rc8.md) 保留歷史分項結果；[RC6 驗收表](acceptance-rc6.md) 保留歷史範圍。網站錯誤測試應呼叫實際 NginiPlaywrightPort／adapter 的受控頁面，不能只有 FakePort 注入錯誤就宣稱 production 已辨識。Cloudflare `cf-mitigated: challenge` 來自官方文件，未在 Ngini live 觀察；普通 403 不自動推斷驗證碼。已完成的非串流 assistant 文字可回 PROVIDER_TEXT_ONLY；沒有可靠供應商拒絕標記時，不宣稱已辨識 GENERATION_REFUSED。

快取測試只操作臨時 fixture：預覽逾期／容量、原圖保留、缺少預覽由驗證原圖重建、工具暫存殘留、活躍／未知／連結／未證明所有權檔案保留。不為測磁碟清理刪除使用者原圖或 profile。

## 歷史真實與客戶端證據

RC1 `host-prompt-only-rc1.json` 記錄 T02 實際普通聊天 PASS。RC6 於 2026-10-10 以新普通聊天再驗一個案例 PASS：只回提示詞，無工具或新增任務，9 筆任務與提交資訊未變、0 次提交；不是提示詞品質或全部意圖保證。詳見 [RC6 客戶端補充](rc6-host-supplement-20261010.md)。

RC2 單次真實新聊天背景生圖、相符圖、預覽、原檔 SHA／解碼 PASS；因額外文字與一次多餘查詢，整體 host FAIL。RC3 既有圖簡潔重開 PASS；RC4 名稱更新安裝 PASS。小／中／大圖的新版本 host 原檔保存必須另驗，不能以 stdio 或 App 接受下載替代。

RC6 已安裝 3,537/3,537 檔相符、隔離 stdio 資源 PASS；檢查器錯把普通取消工具當成 App 工具的首次 FAIL 保留，修正期待後一次重查 PASS，production runtime 未因此變更。原聊天既有貓圖重開：一張圖片、完成回覆無附加模型說明文字，使用者新保存的原檔 SHA／尺寸／完整解碼 PASS。封存後證據不覆寫固定候選／來源 ZIP／RELEASE 快照。

目前可新增真實提交 **0 次**。累計 7 次可能耗額提交、5 份不同原圖、2 份內容相符，不等於生成 7 張。逾時／未知提交／下載失敗只恢復原任務，不換 ID 重送。額度不足、拒絕、驗證與改版先用模擬測試。

乾淨 Windows 安裝／重啟／更新／移除 **BLOCKED、未豁免**；使用者選擇等待。GitHub 實際下載、託管 Actions 及公開發行未執行。

RC7 移除工具結果中的行為指示，保留初始化／工具說明與中立狀態。新增 `--protocol-only` 只驗包外 protocol／fixture／重啟，瀏覽器明確 NOT_RUN。該版執行結果見 [RC7 報告](rc7-audit-resolution.md)。

RC7 封存後在實際普通聊天重驗：三張既有 TEST 與單張貓圖預覽 PASS，沒有新增生成；原先指示衝突旁白消失，但批次及單張都仍附加模型文字，因此無文字回覆 FAIL。首輪新保存的大圖 SHA／解碼 PASS，小／中圖缺少新保存證據，保留 FAIL 報告；補測另存新證據，不覆寫失敗。詳見 [RC7 host 補充](rc7-host-supplement-20261010.md)。


RC8 封存後在 Claude Desktop 2.26454.2 的原聊天、新普通聊天及受控三份既有 fixture 重開：預覽 PASS，但完成回覆仍有額外模型文字，嚴格只回圖片 FAIL。四份既有原檔在 21:21:27.815 UTC 的一次限定 verifier 4/4 fresh exact filenames、原 bytes／SHA／full Sharp decode／stable stat PASS；兩次已記錄的 own-request metadata 比較均 9→9、0 ID／submitted_at／image identity SHA／source 變更，後者覆蓋新聊天與三圖 UI 讀取、早於下載 bytes，沒有新增快照。詳見 [RC8 host 補充](rc8-host-supplement-20261010.md)、[下載](host-original-downloads-rc8.json) 與 [任務紀錄](host-request-state-rc8.json)。沒有新增生圖或重跑 suite；乾淨 Windows 仍 BLOCKED，固定產物不變。


RC9 受控檢查須分別測有 App MIME 宣告的 `_meta` envelope、沒有 App 的 model_poll 完整後備、失敗／取消／quota／多圖必要訊息、卡片公私 ID／status 一致性、損壞 metadata 不降級。新 frame 讀舊結果不等於舊 RC8 frame 可讀新結果；跨版原 ID 明確重開需 actual host 證據。主代理已執行本版完整受控 suite 323/323 與來源 App stdio 6 checks，文件寫入者未重跑；精確本版 suite CSP 已另存，沒有 CSP 重跑。stdio 的 host download 僅準備請求，新普通聊天正確既有圖卡片已呈現、窄三項模型投影已實際 inspector 核對；沒有 raw iframe notification trace，單張貓圖新保存原檔 bytes／SHA／完整解碼與 stable stat 已 PASS。詳見 [RC9 結果邊界](rc9-card-result-boundary.md)，不借用已封存 RC8 305/305。

固定 RC9 MCPB 為 18,188,435 bytes／3,547 files，SHA-256 `023b2863c16c48aecee6fcc6eb2e1c95d44055110ab100fa1b71886965e5c705`。官方 schema、包外 3,547 files 讀回／安全路徑／CRC 與精確 RC9 CSP HTML 關聯 PASS。實際包外 protocol-only 正常 7／fixture 8 tools、同 ID 原圖／重啟 PASS，344 包內模組、0 包外；browser NOT_RUN。另在該包外 bootstrap 執行 App-capability 6 checks PASS；這份 stdio 報告本身不獨立驗證 archive，需與 candidate-inspection-rc9.json 分開閱讀。

有限 first-party 掃描 1,094 files、0 項所掃描模式發現；actual host log 仍未驗。RC9 MCPB 保留封包時的文件快照，早於上述包外報告與本次 current-doc 更新；不重新 stage／封包，也不將文件補充誤稱重建候選。本版來源 export／application-source ZIP 及一次隔離重建 PASS；額外 GitHub ZIP 未建立，application-source ZIP 已提供來源封包。[RC9 native companion 關聯](native-source-companion-rc9.json) PASS：3 份已記錄 binary inventories 與 12 份 selected small archived inputs 相同，沿用固定 RC8 native-source archive；大包 SHA／完整 405-input 證據為歷史 RC8，本輪未重雜湊全部 binary／archive，未建立新 RC9 native ZIP 或進行 native rebuild。已安裝 RC9；actual host 單圖預覽／三項模型投影 PASS、嚴格只圖片 FAIL，單張貓圖新保存原檔 PASS。其他本版 host／乾淨 Windows NOT_RUN，未豁免、0 live。來源 export／ZIP 保留凍結當時快照，早於本次重建結果補充；後續只更新 current docs，不覆寫固定來源或 MCPB。

RC9 固定來源 export 為 1,017 份 declared source files，manifest SHA-256 `bded6392b19679365b06ea18e55fddcc56e0e1ea7b59714329cad3e866101819`；application-source ZIP 含 manifest 共 1,018 entries、2,597,519 bytes，SHA-256 `5308208db0a1b05ec85dacdfe91840193fb2b997dd0d63d94ba12dc67196caa1`。主代理實際 archive 檢查與隔離來源重建報告 source-build-rc9.json 核對一致；一次 fresh pnpm store／frozen-lockfile install 與 build 共 57.014 秒，28/28 own runtime 與固定 MCPB bytes 完全相同、fixture stdio PASS。使用既有開發 Windows，未重跑 suite／browser，也不是 clean Windows 或 native-source rebuild。


RC9 已在現有主機更新，manifest 版本及 28/28 own runtime bytes／SHA 與記錄的 candidate inventory 相符；不宣稱本輪重新核對全部 3,547 installed files 或 native binary。隔離 installed bootstrap 精確 UI9 HTML、5 App／2 ordinary tools 與 App-only visibility PASS，0 新任務。詳見 [安裝核對](desktop-install-rc9.json) 與 [隔離資源核對](installed-resource-inspection-rc9.json)。

Claude Desktop 2.26454.2／Sonnet 5.5 的一個新普通聊天，以原 request_id 重開既有貓圖：一張正確圖片卡片預覽 PASS；實際工具結果 inspector 只見 request_id、status=presenting、delivery_mode=app_poll 三項模型事實，投影 PASS。卡片在窄公開結果下顯示既有原圖，但沒有 instrument raw iframe notification，不把實際 `_meta` 通訊追蹤宣稱已驗。最後仍加一句「已重新開啟該圖片的卡片。」，嚴格只圖片 FAIL。單張貓圖新保存檔案的 bytes／SHA／完整解碼／stable stat 已 PASS；這是獨立保存檔驗證，不宣稱已追蹤全部 UI RPC 或每個人工確認動作；既有圖重開不消耗新生圖額度。詳見 [RC9 單圖實機](host-existing-cat-reopen-rc9.json)。


[RC9 單圖讀取前後任務比較](host-request-state-rc9.json) PASS：9→9，未新增／遺失 ID，submitted_at、完整 image identity 與 source 均未變。這個快照不驗證下載原檔或網站剩餘額度，新增 live 0。


[RC9 單張貓圖新保存補證](host-cat-original-download-rc9-renamed.json) PASS：實際保存為原 basename 的 `.jpg2.jpg` 改名檔，91,506 bytes、1344×768，與原圖 SHA-256／full Sharp decode／stable stat 相符；人工已確認在當前貓圖卡片保存。[初次 exact-name probe](host-cat-original-download-rc9.json) NOT_RUN、沒有讀取圖片 bytes，保留原報告。原實機觀察 JSON 不改寫，保存檔證據是後來的獨立補充，沒有宣稱追蹤 raw UI RPC 或每個人工 dialog 動作。9→9 任務比較是先前讀取後快照，不是下載後新增快照；嚴格只圖片仍 FAIL，中／大 fixture 的實際預覽、其他 RC9 host／乾淨 Windows 仍 NOT_RUN，新增 live 0。


[RC9 三份 TEST 保存補證](host-three-fixtures-download-rc9.json)：RC9 三份既有 TEST 原檔的新保存 3/3 bytes／SHA／full Sharp decode／stable stat PASS，兩個檔案時間均在基線後，0 舊圖片 bytes／新增 live；加上既有貓圖，共 4 份 RC9 新保存原檔通過。檔案 verifier 不觀察 UI。主代理另觀察小圖預覽及其三項模型結果 PASS；中／大圖實際預覽尚未目視驗證，NOT_RUN。三次 get_result 與 AX 最後文字已觀察：「三張圖都已依序重開一次（小圖、一般圖、大圖），未生成任何新圖片。」，批次嚴格只圖片 FAIL。
