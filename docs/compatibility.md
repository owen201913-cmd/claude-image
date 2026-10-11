# 相容性

更新日期：2026-10-12（Asia/Taipei）。正式版本 **0.1.0**，功能行為沿用 RC12；版本標籤／manifest／文件更新，不把歷史測試宣稱為新版重測。[正式驗收紀錄](acceptance-0.1.0.md) 與 [交付索引](release-0.1.0.md) 列出實際範圍。

| 目前範圍 | 證據與限制 |
| --- | --- |
| 目標平台 | Windows x64、Claude Desktop 普通聊天、獨立 MCPB／stdio；現有受測主機為 Windows 11 Home build 26200、Claude Desktop 2.26454.2。macOS、ARM64、32 位元、web／mobile 未支援 |
| 瀏覽器與 host | 標準 Edge／Chrome、專用持久化背景 profile；MCP Apps serverTools／downloadFile 必須可用。較新 Claude 版本不代表已實測 |
| 背景生成／聊天室原圖 | 有歷史真實生成與保存樣本；[測試](testing.md) 與原始報告區分新生成、既有圖重開及原圖雜湊，未重驗為本輪 live |
| 受控回歸 | 沿用 [RC12 332/332 tests、54/54 suites PASS](test-results-rc12-single-worker-20261012.json)，本版未重跑；RC11 首次 327/328 FAIL 保留 |
| 本版建置／精確 UI | 0.1.0 build PASS、單項精確 UI CSP PASS；其餘兩項 CSP 案例與完整 suite 未重跑，詳見交付索引 |
| 嚴格只圖片 | MCPB 單獨的 RC12 回合仍附加文字，FAIL。另行保存 [帳號 Instructions](image-only-setup.md) 後 1 個完整回合 PASS、3 個必要文字控制 PASS；設定影響所有聊天、不由 MCPB 自動套用、不保證所有回合 |
| 乾淨 Windows P4 | **NOT_RUN_USER_WAIVED**：原生 VHDX 啟動遇到 `0x7B` 後返回原 Windows 11 Home，擁有者於 2026-10-12 選擇停止驗收。乾淨 Claude 安裝／更新／重啟／移除未驗收，見 [範圍例外](native-qa-waiver-20261012.md) |
| 新增生圖／公開託管 | 本輪新增 Ngini 提交 0、live 預算 0；GitHub 公開下載／Actions 託管執行尚未驗證 |

只圖片設定文字在 [companion-instructions](../companion-instructions/ngini-image-replies.txt)，操作見 [設定與撤回](image-only-setup.md)。必要的錯誤、人工驗證及直接來源詢問仍保留文字；不宣稱 Claude 原生圖片附件或自動隱藏 host 介面。

以下 RC11 及更早內容是當時狀態與證據快照；「未豁免／未開機」等歷史敘述不覆蓋上述正式版決定，原 JSON／MCPB／source archives 均不改寫。

## RC11 歷史核對

RC11 封存 MCPB 18,210,716 bytes／3,551 members。[安裝核對](desktop-install-rc11.json) own manifest／28 runtime PASS，未重驗全部 installed package／native。[新普通聊天重開既有貓圖](host-existing-cat-reopen-rc11.json) 自動選用 ngini_get_result 一次、一張卡片預覽 PASS，沒有重複卡片或卡片錯誤；[fresh 原圖保存](host-cat-original-download-rc11.json) 91,506 bytes／1344 × 768／SHA／完整 Sharp 解碼／stable stat PASS。[請求紀錄](host-request-state-rc11.json) 9→9、0 提交時間／圖片識別／來源變更。Claude 附加「已重新顯示該圖片卡片，未重新生成。」，嚴格只圖片 **FAIL**。上述 host 證據為 2026-10-10 的既有圖重開與保存，未於本輪重測，新增生成 0。[installed served-resource 核對](installed-resource-inspection-rc11-20261012.json) **PASS**：2026-10-12 以 installed RC11 的隔離 stdio client 執行 readResource，HTML SHA-256 與既有 RC11 CSP 證據相符；5 項 App tools／2 項 ordinary tools、app-only visibility PASS，0 callTool／browser／新增 jobs／live。這不是實際 Claude iframe，也沒有新增 host 預覽或下載驗收。

RC11 恢復三項公開協調資訊與完整 own `_meta`。建置一次 exit 0／wall 7.912 秒、[來源 App stdio](protocol-app-card-rc11.json) 6 checks PASS；[首次完整 suite](offline-tests-rc11.json) 23 files／328 tests、327 PASS／1 CSP 20 秒 timeout FAIL，82.597 秒。未增加 timeout，該 CSP 檔案 isolated single-worker [重測 3/3 PASS](card-csp-retry-rc11.json)，12.974 秒；[精確 CSP](card-csp-smoke-rc11.json) 已保留，不稱完整 suite 一次全過。[封包讀回](candidate-inspection-rc11.json)、[隔離協定](isolated-protocol-smoke-0.1.0-rc.11.json) 與 [包外 App stdio](protocol-app-card-bundle-rc11.json) PASS，344 包內模組／0 包外；協定 fixture 證據不等於 Claude host。見 [驗收](acceptance-rc11.md) 與 [host 結果相容性](host-result-compatibility.md)。

RC10 安裝及 served resource 核對 PASS，但 [實際新普通聊天重開](host-existing-cat-reopen-rc10.json) 顯示卡片資料無效、沒有圖片，另附完成文字：預覽及嚴格只圖片 FAIL，原圖保存 NOT_RUN。raw UI RPC／實際 iframe metadata 未取得，未確定單一根因。RC11 已另驗證同一既有貓圖預覽及原圖保存 PASS，嚴格只圖片仍 FAIL；保留 RC10 失敗。

乾淨 Windows P4 **BLOCKED_NOT_WAIVED**。專用 VM 已建立、保持關機；本輪只量測一次 RAM：2026-10-11T16:33:59.0428867Z（台北 2026-10-12 00:33:59）可用 2.82 GiB／總計 15.589 GiB。專用 VM 設定 4 GiB、保持關機；6 GiB 可用記憶體是本專案保守餘裕閘門，不是 Windows 官方最低要求，目前未滿此閘門。使用者要求保留 Android 模擬器，且暫時無法釋放記憶體、維持候選版；沒有豁免乾淨 Windows 或嚴格只圖片。guest Windows／Claude 安裝、重啟、使用、更新、移除未驗收，沒有自動關閉程式或變更 host 安全設定。live 預算 0，本輪新增 Ngini 提交 0，未公開發布。

RC11 source export 一次封存 1,021 declared files，manifest SHA-256 `d86253f65eedddc0fad216aaba02e6435439dd0557a44acf7f59627ddc836bc8`；application-source ZIP 共 1,022 entries／2,619,484 bytes、SHA-256 `0145dc7587491d757dbab6466594aab779c04658d583c83bee7f4bf11774504c`。[一次來源快照重建](source-build-rc11.json) PASS／33.219 秒：全新 pnpm store、frozen lockfile、28/28 runtime 與固定 MCPB bytes 相同、fixture stdio 8 tools。來源快照早於重建結果及此封存後文件補充；不重新 export／封包。沒有重跑完整 suite／browser，也不是原生來源重建或 clean Windows驗收，[native-source companion 關聯](native-source-companion-rc11.json) 已窄幅 PASS：三份 recorded native binary identity 與十二份小型材料相同，沿用 RC8 來源包；大型 ZIP 雜湊／全部 CRC／405 cached inputs 證據仍是歷史 RC8，沒有重驗。候選 [RELEASE 索引](../release/RELEASE-0.1.0-rc.11.md) 是後續補充，非公開 release／正式版。 [RC11 實機補充](../release/RELEASE-0.1.0-rc.11-host-supplement.md) 另列本次安裝／既有貓圖結果；原候選索引保留當時 host NOT_RUN 的快照。

## 環境與歷史證據

下表保留歷史版本的個別結果；它們不是 0.1.0 的新測試結果。完整來源／封包／host 範圍見 [RC9 驗收](acceptance-rc9.md)、[RC10 驗收](acceptance-rc10.md) 與各版固定 JSON。已封存產物不因目前文件更新而重封包。

| 項目 | 條件／實際證據 |
| --- | --- |
| 平台 | Windows x64；bootstrap 在 native import 前拒絕其他平台／架構。ARM64、32 位元、macOS 未支援 |
| 受測 OS | Windows 11 Home x64 build 26200，既有使用者主機，非乾淨 OS |
| 安裝途徑 | 獨立 MCPB／stdio、Claude Desktop 普通聊天；不是 Code／Cowork 替代驗收 |
| Claude | 2.26454.2 已有歷史實測；manifest 最低 >=2.26454.2 不保證全部後續版本 |
| Node | 套件 >=20.9.0，Claude 提供；本機工程 Node 24.19.0，Claude 內建 Node 曾記錄 24.21.0 |
| 瀏覽器 | 標準安裝 Edge／Chrome；現有樣本 Edge 154.0.4258.62，專用持久化 profile、headless、sandbox 開啟 |
| App host 能力 | serverTools、downloadFile 必須宣告；缺少時明確阻擋，不稱交付完成 |
| 歷史 installed RC9 | manifest／28 own runtime bytes／SHA 與已記錄 RC9 inventory 相符；本輪未核對全 package/native，不是乾淨生命週期 |
| 歷史 installed RC8 | 3,543 files／887 native 材料為歷史核對，不移轉為 RC9 全包驗證 |
| 歷史 installed RC8 隔離資源 | RC8 bootstrap 的 UI8 HTML 相符，5 App／2 普通 tools、隔離資料 0 新任務；不是普通聊天顯示／下載 |
| RC8 來源建置／協定 | PASS；正常 7／fixture 8 tools、RC8 card URI；真實狀態、同 ID 原圖與恢復防護核對。不是 MCPB 或 Claude host 驗收，見 [RC8 報告](rc8-audit-resolution.md) |
| RC8 MCPB／包外 protocol | PASS；官方 schema、3,543 files stage／CRC／安全路徑；正常 7／fixture 8 tools、原圖及同 ID／重啟、344 包內模組／0 包外。protocol-only browser NOT_RUN |
| RC8 Strict-CSP 關聯 | 精確 suite synthetic-host 證據與 HTML 相符；初次舊 RC6 報告不符的 FAIL 保留，不是 runtime CSP 違規，沒有另重跑 CSP |
| RC8 原生來源伴隨包 | PASS；1,302 files CRC／讀回、405 選定來源輸入，不是 native rebuild |
| RC8 application／GitHub 來源 ZIP | PASS；1,011 files、2,555,635 bytes，兩份 bytes 相同；manifest／完整 inventory／CRC／安全路徑讀回 |
| RC8 封存來源新資料夾重建 | PASS；本版一次 33.251 秒、28/28 runtime 固定 bytes 相符、fixture stdio 8 tools；不是 native rebuild／乾淨 Windows |
| RC8 client 下載回執 | production mock DOM 21/21 PASS；明確 10 分鐘 timeout／AbortSignal，未知保存結果不當成確定失敗。Claude 延遲人工確認實機一例 UI PASS（至少 102 秒）；四份既有原檔 fresh bytes／SHA／full decode PASS；實機拋錯／中止分支未驗 |
| RC8 完整受控回歸 | PASS；三項 browser flags 全開，一次 22 files／305/305，0 failed／pending／todo／skip；raw JSON 起訖 36.071 秒 |
| RC7 來源／受控測試 | 301/301 PASS；執行結果見 rc7-audit-resolution.md，與真實網站／Claude host 分開 |
| RC7 普通聊天 | 三份 TEST／單張貓圖預覽 PASS；首輪 fixture 大圖保存 PASS，小／中圖缺少新保存證據。貓圖原始檔名新保存 SHA／解碼 PASS，指定名稱首次 FAIL 保留；單張／批次無文字及後續卡片下載狀態正確性 FAIL，見 rc7-host-supplement-20261010.md |
| RC9 T02 提示詞限定 | [本版新普通聊天一例 PASS](host-prompt-only-rc9.json)：一句中文提示詞、0 可見 tools／權限提示；9→9 任務／提交／image identity／source 未變，raw RPC 未追蹤 |
| RC6 普通聊天 | T02 只要提示詞一個案例 PASS；既有貓圖單一預覽／原檔新保存 SHA 與解碼 PASS |
| RC7 新普通聊天真實生成 | NOT_RUN；live 預算 0 |
| RC8 原聊天單張既有圖 | 預覽 PASS；同 ID 重開仍加兩段說明，無額外模型文字 FAIL。延遲下載確認 UI 一例 PASS、原聊天 9 筆 metadata 比較 PASS；貓圖原檔 fresh bytes／SHA／full decode PASS，見 rc8-host-supplement-20261010.md |
| RC8 新普通聊天既有單圖 | 一張預覽 PASS；仍加一句模型場景描述，無文字 FAIL，沒有再做貓圖下載，不推定舊聊天因果 |
| RC8 三份既有 fixture 受控重開 | 三張 TEST 預覽 PASS、無文字 FAIL；三份原檔 fresh bytes／SHA／full decode PASS；共用讀取後 metadata 9→9、0 ID／提交／image identity SHA／source 變更，不是批次生成 |
| RC8 新普通聊天新生成 | NOT_RUN；live 預算 0 |
| 乾淨 Windows 生命週期 | BLOCKED、未豁免；專用 VM 已建立且關機，可用 RAM 不足；保留使用者指定的 Android 模擬器，Windows／乾淨 Claude 未安裝驗收 |
| GitHub HTTPS／託管 CI | NOT_RUN，尚未公開 |

歷史 RC1 的 T02 只要提示詞為實際普通聊天 PASS；RC2 新聊天一次中文短描述、相符 JPEG、原聊天預覽及 91,506-byte 原檔 SHA／解碼 PASS，但整體 host 因額外文字與查詢 FAIL。RC3 既有圖簡潔重開 PASS，無全新生成。跨版本結果不轉寫成 RC6 通過。

開發累計 7 次可能耗額提交、5 份不同已取得原圖、2 份內容相符。不等於全部網站歷史、實際總生成張數或剩餘配額。fixture／重取／下載不是新生成。

RC8 修改初始化／工具描述及 App client 下載回執處理，backend 網頁提交／去重／輪詢未改。SDK 預設 60 秒只提供可能的機制線索，RC7 實機錯誤的唯一原因未確認。RC8 原聊天、新聊天及受控三圖預覽 PASS／無額外文字 FAIL；已查核協定沒有外掛可強制 host 完成文字靜默的標準能力，見 [圖片回覆邊界](image-only-host-boundary-rc8.md)。歷史與新版結果各自保留，不能合併為完整通過。

RC8 export／來源 ZIP 在 2026-10-09T20:54:13.978Z 已封存，文件早於本頁安裝狀態等補充；不更新或重新打包固定產物。


[RC9 單圖讀取前後任務比較](host-request-state-rc9.json) PASS：9→9，未新增／遺失 ID，submitted_at、完整 image identity 與 source 均未變。這個快照不驗證下載原檔或網站剩餘額度，新增 live 0。


[RC9 單張貓圖新保存補證](host-cat-original-download-rc9-renamed.json) PASS：實際保存為原 basename 的 `.jpg2.jpg` 改名檔，91,506 bytes、1344×768，與原圖 SHA-256／full Sharp decode／stable stat 相符；人工已確認在當前貓圖卡片保存。[初次 exact-name probe](host-cat-original-download-rc9.json) NOT_RUN、沒有讀取圖片 bytes，保留原報告。原實機觀察 JSON 不改寫，保存檔證據是後來的獨立補充，沒有宣稱追蹤 raw UI RPC 或每個人工 dialog 動作。9→9 任務比較是先前讀取後快照，不是下載後新增快照；嚴格只圖片仍 FAIL，中／大 fixture 的實際預覽、其他 RC9 host／乾淨 Windows 仍 NOT_RUN，新增 live 0。


[RC9 三份 TEST 保存補證](host-three-fixtures-download-rc9.json)：RC9 三份既有 TEST 原檔的新保存 3/3 bytes／SHA／full Sharp decode／stable stat PASS，兩個檔案時間均在基線後，0 舊圖片 bytes／新增 live；加上既有貓圖，共 4 份 RC9 新保存原檔通過。檔案 verifier 不觀察 UI。主代理另觀察小圖預覽及其三項模型結果 PASS；中／大圖實際預覽尚未目視驗證，NOT_RUN。三次 get_result 與 AX 最後文字已觀察：「三張圖都已依序重開一次（小圖、一般圖、大圖），未生成任何新圖片。」，批次嚴格只圖片 FAIL。
