# RC8 圖片回覆與下載回執修正

2026-10-10（Asia/Taipei）。仍為發行候選；RC8 原聊天、新普通聊天及受控三份 fixture 預覽 PASS、無額外模型文字 FAIL，原圖重開交付分項通過，整體第一版驗收仍未通過，不能稱正式版。

RC7 已在 Claude Desktop 2.26454.2 更新並重驗。三張 TEST 和原聊天既有貓圖都可見；單張和批次仍有額外模型文字，因此無文字回覆 FAIL。首輪 fixture 大圖新保存 PASS、小／中圖缺少新保存證據；貓圖另以原始檔名的新保存 SHA／完整解碼 PASS，先前指定 RC7-cat.jpg 未找到的 FAIL 保留。人工確認數分鐘後，卡片仍以 DELIVERY_BLOCKED 斷言貓圖下載未完成，狀態正確性 FAIL。見 [RC7 host 補充](rc7-host-supplement-20261010.md)。RC8 已更新並核對；原聊天與新普通聊天單張重開預覽 PASS，但分別仍有兩段／一句模型說明；受控三份 fixture 也有額外文字，見 [RC8 host 補充](rc8-host-supplement-20261010.md)。

RC8 移除「圖片可見後」才不寫文字的條件，將一般成功／等待中的圖片卡片視為圖片要求的回覆內容。顯示狀態未知只限制交付宣稱，不自行變成錯誤說明。保留必要錯誤、驗證、內容不符、非預期多圖及使用者主動詢問；明確要求重開多個既有 ID 時完成所有指定項目。工程驗收資訊保留於文件，不放入一般模型回覆指令。

RC8 同時修改 App 原檔下載回執處理：host download 呼叫明確使用 10 分鐘 timeout 與 AbortSignal；提交給 host 前的讀取／SHA 失敗、host 明確 isError 與拋錯／本機中止分開處理。後者只代表保存結果未知，不斷言使用者未保存，也不回報 blocked telemetry。沒有自動再下載、重送生圖或控制 host 下載確認框。App 自身版本為 RC8，沒有新增 runtime 模組，白名單仍為 28 份。

本機 SDK 原始碼的預設 timeout 為 60 秒，這是可能的機制線索；沒有證據證明它是 RC7 實機錯誤的唯一原因。網頁生成、提交、去重、取消、輪詢及伺服器原檔讀取邏輯未改；App client 的下載處理已改。初始化／工具描述仍不能保證 Claude 最終回覆完全無文字。

| 本版檢查 | 狀態 | 範圍 |
| --- | --- | --- |
| TypeScript／UI 建置 | PASS | 本版實際建置 exit 0 |
| 下載 production mock DOM | PASS | 21/21；測實際 client 在模擬 host／DOM 的回執分類與中止，不是 Claude host |
| 修改後來源 stdio 協定 | PASS | 正常 7／fixture 8 tools，資源為 `ui://ngini-image-bridge/0.1.0-rc.8/image-card.html`；文字 JSON／structuredContent 沒有 next_action／私密紀錄欄位，同 ID fixture 原圖 SHA／身分及恢復防護通過。`protocol-smoke-rc8-download.json`，0 次 live；不是包外 MCPB 或 Claude host |
| 完整受控回歸 | PASS | 一次完整執行，三項受控 browser flags 全開；22 files、305/305、0 failed／pending／todo／skip。raw JSON 起訖時間 36.071 秒，`offline-tests-rc8.json`；不是 live Ngini 或 Claude host 驗收。RC7 301/301 為歷史結果 |
| MCPB schema／archive 讀回 | PASS | 官方 schema；3,543 files 與固定 stage 逐檔相符，安全路徑／CRC／包外解壓通過，見 candidate-inspection-rc8.json |
| Strict-CSP 產物關聯 | PASS | RC8 完整套件於 2026-10-09T20:40:54.945Z 已輸出的 zero-height 案例；HTML SHA 與 dist／MCPB 相符，synthetic host PASS。報告另封存 card-csp-smoke-rc8.json，沒有另外重跑 CSP，不是 Claude host |
| 初次包外驗證 | FAIL | 舊 card-csp-smoke.json 為 RC6，報告／產物關聯不符；保留 candidate-inspection-rc8-initial-failure.json，不是已觀察到 CSP runtime 違規。改用既有精確 RC8 證據後第二次驗證 PASS |
| 包外 protocol／fixture／重啟 | PASS | 實際 MCPB 一次 protocol-only：正常 7／fixture 8 tools、29,746-byte 原圖 SHA、同 ID 重取／重啟及 344 個包內模組核對，0 個包外模組；browser 明確 NOT_RUN，見 isolated-protocol-smoke-0.1.0-rc.8.json |
| 有限 first-party 來源掃描 | PASS | 1,087 files、0 項所掃描模式發現，見 release-audit-rc8.json；不是全面秘密或第三方 binary 保證 |
| 原生來源伴隨包 | PASS | 1,302 files CRC／讀回、405 個選定來源輸入核對；不是 native rebuild 或法律認證，見 native-source-inspection-rc8.json |
| 已安裝檔案／隔離 stdio 資源 | PASS | installed-candidate-rc8.json：3,543/3,543 files 位元組／SHA 與固定候選相符，28 份 own runtime、887 份 native 材料。installed-resource-inspection-rc8.json：實際 installed bootstrap 的 UI8 HTML 相符，5 App／2 普通 tools，隔離資料 0 新任務；不是普通聊天 UI 驗收 |
| Application／GitHub 來源 ZIP | PASS | 1,011 files、2,555,635 bytes，兩份 ZIP 位元組相同；來源 manifest、精確 bytes／inventory、安全路徑／CRC 讀回通過，見 source-inspection-rc8.json |
| 封存來源新資料夾重建 | PASS | 本版一次執行，33.251 秒；28/28 own runtime 與固定 MCPB bytes 相同，fixture stdio 8 tools，見 source-build-rc8.json；不是 native rebuild 或乾淨 Windows |
| RC8 原聊天單張既有貓圖 | FAIL | 同 ID／同要求，一張預覽 PASS、無模型文字 FAIL；延遲確認至少 102 秒，人工保存後無錯誤狀態的 UI 一例 PASS，原聊天 metadata 9 筆／0 新紀錄 PASS；貓圖 fresh bytes／SHA／full decode／stable stat PASS |
| RC8 新普通聊天既有貓圖 | FAIL | 新空白普通聊天自動重開同 ID，一張預覽 PASS，但仍加一句場景描述；沒有另做下載，舊對話因果未證明 |
| RC8 三份既有 fixture 重開 | FAIL | 主代理逐一見到三張 TEST 預覽 PASS；仍有項目與狀態文字，無文字 FAIL；三份 fresh bytes／SHA／full decode／stable stat PASS；共用讀取後 metadata 9→9、0 變更，不是批次生成 |
| RC8 新普通聊天真實生成 | NOT_RUN | live 預算 0 |
| 乾淨 Windows 生命週期 | BLOCKED | 未豁免 |

固定 MCPB 為 **18,163,254 bytes／3,543 files**，SHA-256 `4be2e374d67699496992b35114bab1585f731b80500701d192c3171044ea9af5`。精確 RC8 CSP HTML SHA-256 為 `8c8016f784c6718df470c28d4eaee5068979d19d2e486f93b83b84481710843a`；測試使用攔截本機頁面與 synthetic host，不代表實機預覽／保存。

同版 native-source 為 **198,683,229 bytes／1,302 files**，SHA-256 `31e489b7247fdadce64f3846fd3e0f49277244057e453ff7e486b104dc10171f`。選定來源及授權通知讀回通過，未確認獨立授權的 build recipe repository 仍只提供固定來源連結。

Application-source 與 GitHub-source 同為 **2,555,635 bytes／1,011 files**，SHA-256 `c9525f3700ea13874eabe078351465ca4a1992d86b8239deba74352dbf9b1b90`；來源 manifest SHA-256 `ff8bdae596964d9939e2eeb36eec30d4bac77487e22c1bfb4cf4cc59563327f8`。來源於 2026-10-09T20:54:13.978Z 已封存，早於本頁安裝、來源重建與 host 補充。固定 MCPB／來源 export／ZIP 保留各自當下文件快照，不回寫或重新封包；四份既有原檔新保存、SHA／full decode／stable stat 與兩次讀取後 metadata 比較 PASS，見 host-original-downloads-rc8.json／host-request-state-rc8.json；嚴格無額外模型文字仍實測 FAIL，完整第一版驗收尚未通過。外掛不能透過已查核協定強制 host 不寫完成文字，見 [圖片回覆邊界](image-only-host-boundary-rc8.md)。

已知 upstream 通知閱讀問題仍保留：搬入資料夾的 `defmt-parser` README 以 `../LICENSE-*` 連結授權，但原文檔案實際在同一目錄且已包含。未修改 upstream bytes，不宣稱連結已修正，也不宣稱法律認證。

本輪新增 Ngini 提交 0。live 預算 0；乾淨 Windows 生命週期 BLOCKED 且未豁免；公開 repo／release 未授權。固定 RC7 MCPB、來源 ZIP、原生來源及 RELEASE 快照不改寫。
