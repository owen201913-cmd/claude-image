# Changelog

## 0.1.0 — 2026-10-12, release with a documented Windows-testing exception

- 正式發行保留 RC12 功能行為，只更新版本標籤、manifest 與交付文件；不新增帳號、API、收費、額度池或生成來源。MIT 授權，非官方 Ngini 整合；實際產物與雜湊見 [交付索引](docs/release-0.1.0.md)。公開 repository 為 [owen201913-cmd/claude-image](https://github.com/owen201913-cmd/claude-image)，維護者顯示名稱為 Yutou；正式 Release 與目前限制見交付索引。
- 沿用後續 [RC12 完整單 worker 受控測試](docs/test-results-rc12-single-worker-20261012.json)：332/332 tests、54/54 suites PASS、原 20 秒 timeout 與三項 browser flags／fixture 開啟。0.1.0 建置與本版精確 UI 的單項 CSP 檢查 PASS，其餘兩項 CSP 案例未重跑；正式版沒有重跑完整 suite 或新增 live，live 預算 0；舊 RC11 327/328 FAIL 與全部歷史報告保留。
- 提供獨立 [Instructions 文字](companion-instructions/ngini-image-replies.txt) 與 [帳號設定／撤回說明](docs/image-only-setup.md)。實際保存後 1 個既有圖完整回合嚴格只圖片 PASS、3 個必要文字控制 PASS；不是 MCPB 自動載入或確定性靜默能力，MCPB-only／Skill 的原 FAIL 不改寫。
- 原生 VHDX 開機遇到 `0x7B`，已返回原 Windows 11 Home；唯一 QA 開機項目已移除、原開機設定已核對。擁有者於 2026-10-12 明確放棄乾淨 Windows P4，記為 **NOT_RUN_USER_WAIVED**，不改為 PASS。乾淨安裝、更新、重啟及移除未驗收；[例外紀錄](docs/native-qa-waiver-20261012.md) 與 [正式版驗收](docs/acceptance-0.1.0.md) 分開列出證據與限制，不推定開機失敗原因。
## 0.1.0-rc.12 — 2026-10-12, result-time reply contract trial

- 成功且有效的單張 App 圖片結果，保留三項公開協調事實及完整圖片 metadata，另加入短的伺服器回覆契約：圖片卡片即回答，結束該回合。錯誤、查詢失敗、額度耗盡、非單張數量、pending 及非 App 後備不套用；不把網站文字加入指令。
- 針對變更的測試 29/29 PASS；編譯後 [MCP App 協定](docs/protocol-app-card-rc12.json) 6 checks PASS。沒有重跑完整 RC11 suite、瀏覽器或已完成的大型來源驗證，不能稱 RC12 全套測試通過。
- MCPB 為 18,218,016 bytes，SHA-256 `8fbdae4ed10877010ae0edfc50bd221046940d5702635aefeca74eb410f90101`。封存包包含產出當時的舊文件快照；目前文件與後續驗收另行提供，這是測試候選包。只核對 [已安裝版本及變更的 card-contract](docs/desktop-contract-install-rc12.json)，不是全安裝檔核對。
- [新普通聊天既有貓圖](docs/host-existing-cat-reopen-rc12.json) 一張預覽 PASS，但完整回合附加兩段文字，嚴格只圖片 FAIL；實際工具檢視器可見回覆指令與三項協調欄位。這段結果指令不提供確定的模型靜默保證。新 [乾淨 Windows 替代方案](docs/clean-windows-alternatives.md) 採原生 VHDX 開機，必要條件預檢／映像準備已獲批准，[C 磁碟與 UEFI 唯讀預檢](docs/native-boot-preflight-20261012.json) QUALIFIED；媒體與映像準備未完成，開機項目與重啟須分別批准。P4 未通過、未豁免。本轮新增 Ngini 提交 0，未公開 repository 或 release。

## 0.1.0-rc.11 — 2026-10-10, preview restored / strict image-only FAIL

- 恢復正常 App 結果的 request_id、status、delivery_mode 三項公開資訊與完整 own `_meta`；撤回 RC10 的空白公開成功輸出與僅空白結果的解析路徑。協定／CSP 檢查同步回到此相容格式。
- RC10 實際 fresh 普通聊天重開既有貓圖顯示卡片資料無效、沒有圖片預覽，模型仍加完成文字；原始 FAIL 證據保留，不假設未追蹤的 raw iframe metadata 故障原因。
- RC11 建置一次 exit 0／7.912 秒 wall time；來源 App stdio 6 checks PASS。完整受控 suite 首次 23 files／328 tests：327 PASS、1 CSP 20 秒 timeout FAIL，82.597 秒，原報告保留。沒有增加 timeout；僅 affected CSP 檔案以 isolated single worker 重測一次 3/3 PASS、12.974 秒，精確 HTML-CSP 關聯另存。見 [完整測試](docs/offline-tests-rc11.json)、[單項重測](docs/card-csp-retry-rc11.json)、[CSP 證據](docs/card-csp-smoke-rc11.json) 與 [App stdio](docs/protocol-app-card-rc11.json)。RC11 MCPB 已封存，schema／3,551 members 讀回及精確 HTML-CSP 關聯 PASS；包外 protocol-only 3 checks、344 包內模組／0 包外、同圖／去重／重啟 PASS，包外 App stdio 6 checks PASS。[RC11 installed manifest／28 own runtime 核對](docs/desktop-install-rc11.json) PASS，沒有重驗其他 runtime／全部 installed package／native；[實際新普通聊天重開既有貓圖](docs/host-existing-cat-reopen-rc11.json) 自動選用 ngini_get_result 一次、一張卡片預覽 PASS；[fresh 原圖](docs/host-cat-original-download-rc11.json) 91,506 bytes／1344 × 768／SHA／完整解碼 PASS，[請求紀錄](docs/host-request-state-rc11.json) 9→9、0 提交時間／圖片識別／來源變更，新增 Ngini 0，不是一次 328/328 PASS。見 [封包讀回](docs/candidate-inspection-rc11.json)、[隔離協定](docs/isolated-protocol-smoke-0.1.0-rc.11.json) 與 [包外 App 協定](docs/protocol-app-card-bundle-rc11.json)。封存 MCPB 不因後續 current-doc 更新而重新打包。
- RC11 附加「已重新顯示該圖片卡片，未重新生成。」，嚴格只圖片 FAIL，正式驗收 NOT_PASSED。乾淨 Windows P4 BLOCKED、未豁免；專用 VM 關機，2026-10-10 00:09:51 UTC 可用 RAM 收據 0.531 GiB、未滿啟動條件。使用者暫時無法釋放記憶體、維持候選版，保留指定的 Android 模擬器；guest 安裝／生命週期尚未驗收，嚴格只圖片未豁免。
- RC11 source export 一次：1,021 declared files，application-source ZIP 含 manifest 共 1,022 entries／2,619,484 bytes，SHA-256 `0145dc7587491d757dbab6466594aab779c04658d583c83bee7f4bf11774504c`。一次 fresh pnpm store／frozen-lockfile source rebuild [PASS](docs/source-build-rc11.json)，33.219 秒、28/28 runtime byte exact、fixture stdio 8 tools PASS；沒有重跑完整 suite／browser，不是 native rebuild 或乾淨 Windows。來源快照早於這份重建報告與目前文件補充，MCPB／export／ZIP 不回寫。[RC11 native-source companion 關聯](docs/native-source-companion-rc11.json) PASS：三份已記錄 native inventories 與十二份 selected small archived inputs 相同，沿用 RC8 來源包；不重雜湊／全 CRC 重驗大型歷史 archive、不重建 native。候選 [RELEASE 索引](release/RELEASE-0.1.0-rc.11.md) 另存目前證據與限制，正式驗收仍 NOT_PASSED、實機待驗、未公開。 [後續實機補充](release/RELEASE-0.1.0-rc.11-host-supplement.md) 另列本次 PASS 與 FAIL；原候選索引保留寫入時 host NOT_RUN 快照，不回寫封存產物。
- 見 [RC11 驗收](docs/acceptance-rc11.md) 與 [host 結果相容性](docs/host-result-compatibility.md)。舊封存包／來源與報告不改寫，未公開 repository／release。

## 0.1.0-rc.10 — 2026-10-10, quiet public success / actual host FAIL

- 正常 App 成功結果曾改為空白 content、省略 structuredContent，完整資料保留在 own `_meta`；pending／錯誤／取消／quota／fallback 不變。候選 parser 支援空白格式並核對身份，舊 frame 跨版 refresh 不宣稱相容。
- 升版前 focused 64/64、RC10 build、完整受控 suite 328/328、compiled／包外 App stdio、封包及安裝核對 PASS；[實際 host 重開](docs/host-existing-cat-reopen-rc10.json) 預覽與嚴格只圖片 FAIL、原圖保存 NOT_RUN。
- raw UI RPC／故障原因未確定，乾淨 Windows未通過。見 [RC10 驗收](docs/acceptance-rc10.md)／[卡片邊界](docs/rc10-card-result-boundary.md)；所有固定產物保留。

## 0.1.0-rc.9 — 2026-10-10, App metadata split / strict image-only FAIL

- 正常 app_poll 卡片與預覽資料移至工具結果 `_meta`，模型只收必要協調事實；錯誤／取消／quota／多圖例外與 model_poll 完整後備保留。不是強制模型靜默機制。
- 新 App 解析 metadata、核對公開 ID／status 並保留舊完整 shape 後備；損壞的新 metadata 不默默降級。舊 RC8 frame 只讀 structuredContent，跨版 refresh 不宣稱相容；以原 ID 明確重開新卡片的遷移尚待實機驗證，沒有可信 App-origin 標記可自動區分。
- 主代理回報本版 build 一次 exit 0；完整受控 suite 23 files／323/323、0 failed／pending／todo／skip、raw 24.474 秒、三 browser flags；實際來源 App stdio 6 checks PASS（隔離 TEST 1、0 browser／live，host 下載僅準備）。精確本版 suite CSP 已另存，沒有重跑。本版 RC9 MCPB 已固定，schema／3,547-file 包外讀回、精確 CSP 關聯及 protocol-only PASS；正常 7／fixture 8、同 ID／重啟，344 包內模組／0 包外，browser NOT_RUN。候選包外 bootstrap App-capability 同 6 checks PASS，但該報告自身不是 archive integrity 證據；first-party 1,094 files 掃描、0 項所掃描模式發現。本版固定 source export 1,017 declared files／application-source ZIP 1,018 entries、2,597,519 bytes；一次 fresh store frozen install／build 57.014 秒、28/28 runtime byte exact 與 fixture stdio PASS，非 native rebuild／clean Windows。額外 GitHub ZIP 未建立；[RC9 native companion 關聯](docs/native-source-companion-rc9.json) PASS：3 份已記錄 binary inventories 與 12 份 selected small archived inputs 相同，沿用固定 RC8 native-source archive；大包 SHA／完整 405-input 證據為歷史 RC8，本輪未重雜湊全部 binary／archive，未建立新 RC9 native ZIP 或進行 native rebuild。RC9 已更新，manifest／28 own runtime bytes／SHA 相符及隔離 UI9／5 App／2 ordinary tools PASS，沒有重驗全部 installed/native。新普通聊天既有貓圖預覽／實際 inspector 三項模型事實 PASS，仍加一句「已重新開啟該圖片的卡片。」、嚴格只圖片 FAIL；單張貓圖的改名原檔新保存 bytes／SHA／完整解碼／stable stat PASS；初次 exact-name 掃描 NOT_RUN、未讀圖片 bytes 的報告與原 host 觀察 JSON 保留，不以檔案證據宣稱追蹤 raw UI RPC 或每個人工確認。中／大 fixture 實際預覽、其餘 RC9 host／舊 frame 遷移／生命週期／host log／乾淨 Windows NOT_RUN，不繼承 RC8 PASS；未新增 live／公開，固定 RC8 產物及證據不變。新增 VM 準備授權不等於乾淨 Windows 已通過。固定 RC9 MCPB／export／ZIP 保留各自凍結當時快照，不為實機補充回寫或重封包。詳見 [RC9 實機](docs/host-existing-cat-reopen-rc9.json) 與 [前後任務比較](docs/host-request-state-rc9.json)：9→9、0 ID／提交／image identity／source 變更，不代替下載或網站額度證據。

- 單張貓圖的新保存補證見 [改名原檔驗證](docs/host-cat-original-download-rc9-renamed.json)：91,506 bytes、1344×768，SHA-256 與原圖相符、full Sharp decode／stable stat PASS。[初次 exact-name probe](docs/host-cat-original-download-rc9.json) 維持 NOT_RUN，沒有讀圖片 bytes；原實機觀察 JSON 保留其當時狀態。嚴格只圖片仍 FAIL，中／大 fixture 實際預覽、其他 RC9 host／舊 frame 遷移／乾淨 VM／Windows NOT_RUN。固定 MCPB／export／ZIP 未改；目前沒有建立證據 ZIP，新增 live 0。

- [RC9 T02](docs/host-prompt-only-rc9.json) 一個新普通聊天 PASS：只回一句中文提示詞、沒有可見 tools／權限提示，own records 9→9 且 ID／提交／image identity／source 未變、新增 live 0；raw host RPC 未追蹤，不是全部意圖保證。

- [三份 TEST 保存補證](docs/host-three-fixtures-download-rc9.json)：RC9 三份既有 TEST 原檔的新保存 3/3 bytes／SHA／full Sharp decode／stable stat PASS，兩個檔案時間均在基線後，0 舊圖片 bytes／新增 live；加上既有貓圖，共 4 份 RC9 新保存原檔通過。檔案 verifier 不觀察 UI。主代理另觀察小圖預覽及其三項模型結果 PASS；中／大圖實際預覽尚未目視驗證，NOT_RUN。三次 get_result 與 AX 最後文字已觀察：「三張圖都已依序重開一次（小圖、一般圖、大圖），未生成任何新圖片。」，批次嚴格只圖片 FAIL。

## 0.1.0-rc.8 — 2026-10-10, image replies and download receipts

- RC7 實機單張及批次出現額外模型文字；保留 FAIL 證據，不把圖片預覽成功當作無文字回覆通過。
- 統一圖片回覆規則，正常圖片卡片不附加顯示狀態免責說明；多張既有重開依使用者指定完成，不增加生成。錯誤、驗證、內容不符及明確資訊詢問仍可回覆。
- 修改 App client 的 host download：明確 10 分鐘 timeout 與 AbortSignal，提交前讀取／SHA 錯誤及 host 明確 isError 與拋錯／本機中止分開；未知保存結果不再斷言未保存、不送 blocked telemetry，也不自動重下載或控制下載確認框。
- Backend 網頁生成／提交、去重、輪詢及結果白名單維持原狀；App 自身版本更新，runtime 白名單仍為 28 份。初始化／工具描述不能保證模型完全服從，RC8 實機無額外模型文字仍 FAIL。
- 修改後 build／來源 stdio PASS；production mock DOM 21/21，三項 browser flags 全開的完整受控回歸一次 22 files／305/305、0 failed／pending／todo／skip，raw JSON 起訖 36.071 秒。官方 MCPB schema／3,543-file archive 讀回、安全路徑與一次包外 protocol-only／fixture／同 ID／重啟 PASS；344 相依模組均在包內，browser NOT_RUN。
- 首次包外驗證使用舊 RC6 CSP 報告而 FAIL，原始失敗保留；改用這次 suite 已輸出的精確 RC8 zero-height strict-CSP synthetic-host 報告後第二次 PASS，沒有另重跑 CSP，不把報告不符當成 runtime CSP 違規。有限 first-party 掃描 1,087 files、0 項所掃描模式發現。
- 同版 native-source 1,302 files／405 選定來源輸入、CRC／讀回 PASS；application／GitHub source ZIP 1,011 files／2,555,635 bytes、兩份 bytes 相同，manifest／完整 inventory／CRC／安全路徑讀回 PASS。本版來源重建一次 33.251 秒、28/28 runtime 固定 bytes 相符、fixture stdio 8 tools PASS，不是 native rebuild／乾淨 Windows／法律認證。
- RC8 已更新，3,543 installed files bytes／SHA 相符，own runtime 28／native 材料 887；隔離 installed bootstrap 的 UI8 HTML、5 App／2 普通工具核對 PASS，0 新任務。這不代表普通聊天預覽／下載或無額外模型文字通過。
- RC8 原聊天／同一 ID 貓圖與新空白普通聊天重開：各一張預覽 PASS，分別仍有兩段／一句完成文字，嚴格無文字 FAIL；受控三份 fixture 逐一預覽 PASS，也仍有模型項目與狀態文字。Host 思考摘要另記，不推定舊對話因果。
- RC8 原聊天下載確認框可見至少 102 秒，人工保存後框已關閉、卡片無 DELIVERY_BLOCKED／失敗文字，單一 UI 案例 PASS，未觀察自動第二次下載；原聊天 21:01:43.542718 UTC metadata 仍 9 筆／0 新紀錄 PASS。四份既有原檔一次 verifier 4/4 fresh exact filenames／原 bytes／SHA／full Sharp decode／stable stat PASS（21:21:27.815 UTC）；兩次既有 metadata 比較均 9→9、0 ID／提交／image identity SHA／source 變更，後者覆蓋新聊天及三圖讀取、早於下載 bytes，沒有新增快照。詳見 rc8-host-supplement-20261010.md。
- 固定來源 export／ZIP 於 2026-10-09T20:54:13.978Z 封存，早於安裝／來源驗證等文件補充；MCPB 與 ZIP 保留各自當下快照，不為補充結果重新打包。
- RC7 首次 fixture 小／中圖新保存證據不足、大圖 PASS；貓圖原始檔名新保存 SHA／完整解碼 PASS，指定名稱首次 FAIL 保留。卡片後續錯報下載未完成及單張／批次模型文字仍 FAIL。SDK 預設 60 秒是可能的機制線索，實機唯一原因未確認。沒有新 live／公開；乾淨 Windows 仍未豁免。

## 0.1.0-rc.7 — 2026-10-10, neutral tool results

- 移除工具結果的 next_action 回合指示，保留初始化／工具描述中的行為規則；結果白名單投影保留來源、額度、錯誤與真實任務狀態。
- 修正已安裝資源檢查器的 5 App／2 普通工具期待；新增隔離 harness --protocol-only，不重跑未修改的瀏覽器冷啟動。
- 補入 RC6 封存後實機證據：只要提示詞、單張貓圖重開與大小 fixture 傳輸 PASS，批次額外文字 FAIL。RC7 實測另列，不能繼承歷史 PASS。
- 一次提交、原語言短描述、去重及原檔下載維持原邏輯；沒有新增 live 或公開發行，乾淨 Windows 未豁免。

## 0.1.0-rc.6 — 2026-10-09, production-path and retention audit

- 補強 production 網頁最終文字與文件化 challenge 訊號辨識；沒有可信 refusal 標記時不猜測精確拒絕分類，不自動重送。
- 預覽及工具專用下載暫存有界、盡力清理；原圖、任務、profile、未知檔案保留，缺少預覽從驗證原圖重建。
- 修正貢獻入口舊版本及安裝包缺少相對連結目標；逐項標明模擬／歷史／新版客戶端缺口。
- 新版實際結果另列審查與候選報告；沒有新增live、沒有公開，乾淨Windows未豁免。

## 0.1.0-rc.5 — 2026-10-09, release audit fixes

- 提交前預檢圖片／metadata／暫存儲存，將保存初始化錯誤納入 STORAGE_ERROR；失敗不自動重生。
- Windows x64 bootstrap、完整固定工具／動態能力宣告及最低 Claude 版本；不宣稱所有較新版本已實測。
- runtime 明確白名單與實際 staging 有限檢查，拒絕未審核殘留檔。
- 去識別的瀏覽器啟動診斷與統一的安裝／發布文件。
- 本版整合測試結果另記 testing 與候選旁報告。未新增 live、未公開發布；乾淨 Windows 仍 BLOCKED 且未豁免。

## 0.1.0-rc.4 — 2026-10-09, display metadata update

- 使用者要求顯示名稱改為 `Claude Image`，短描述與詳細說明改用英文，提示使用簡短描述；每日 5–10 次標為預估，實際依 Ngini 當下限制。
- 內部 extension name、author、儲存目錄、工具名稱與生成／下載邏輯維持原狀。仍為候選版，未新增真實生成或公開發布。
- RC3 後續安裝 3,524/3,524 比對及既有圖片重開的無額外文字／查詢驗證 PASS，詳見獨立封存後報告；不回填以下 RC3 建置當時的狀態，也不替代全新生成或乾淨 Windows 驗收。

## 0.1.0-rc.3 — 2026-10-09, source/package checks PASS / host NOT_RUN

- 修正第二次停程後UNKNOWN標記，僅正常app_poll結果加入下一步提示。RC3 build、232/232完整離線（三種browser opt-in）、fixture8／正常7tools來源stdio、精確RC3 HTML嚴格CSP與有限release-audit（1,069files／0findings）PASS；封包schema／3,524檔逐檔比對與隔離8-tool stdio（1785ms）PASS，host NOT_RUN，未宣稱已安裝或模型體驗已改善。
- RC2固定封包與實機證據保持原狀；測試預算已用完，不自行增加真實提交。2026-10-09使用者選擇維持候選版、等待乾淨Windows，BLOCKED未豁免；公開來源可取得／發布仍是獨立gate。
- RC3固定MCPB18,108,655bytes、SHA `fa0f9d96ee4450f7c112bd45605fa7cece8908f3c13ec79d6415a24542be5d21`；native-source198,683,229bytes／1,302files／405inputs、SHA `8bbf9a1d2b4e9d08657a927b17982427c4263616bc89137a0b001aa7da0a68da`。source ZIP待文件固定後另封存；更新提示已準備，安裝／host待驗，不重包歷史MCPB。

## 0.1.0-rc.2 — 2026-10-09, core delivery PASS / host acceptance FAIL

- 將既有預覽／下載訊息標為歷史觀察，不以舊卡片紀錄證明本次已顯示或保存；新增兩項回歸，delivery-status 窄測試 12/12 PASS。RC2 build、三種 browser opt-in 全開的 229/229 離線、來源／隔離 8-tool fixture stdio、嚴格 CSP 與封包檢查 PASS；安裝 3,524/3,524 檔案相符。
- 強化英文 generate／get_result 的無旁白指令；不宣稱模型必定遵循。
- RC1 已安裝，3,524/3,524 檔案相符；T02 只要提示詞未生成。普通聊天 fixture 約一分鐘後出現一張簡潔卡片，原圖下載 3,224,337 bytes、原 SHA／完整解碼 PASS；模型在卡片載入前仍加說明文字。
- 本輪唯一追加 live 已使用：新普通聊天中文原樣描述，一次提交、一張內容相符圖片、一張簡潔卡片及原聊天原圖下載 PASS；JPEG 91,506 bytes／1344×768，原 SHA／完整解碼一致。9 次活躍程序樣本皆見 headless，0 個專用瀏覽器可見主視窗。
- host 整體 FAIL：模型在卡片後加一句場景描述，且在已宣告 app_poll 時多查一次同 ID 狀態；沒有多開卡片或增加生成。最小 App 不保證模型不加旁白。
- 累計 7 次可能耗額提交、5 份不同 Ngini 原圖、2 份內容相符；不是全站／手動活動總數。授權預算已用完。乾淨 Windows BLOCKED，公開來源可取得及發布授權是獨立 gate；固定歷史產物不覆寫。

## 0.1.0-rc.1 — 2026-10-09, acceptance in progress

- 新增不開 App 的 `ngini_get_status`；等待查詢與取消不再建立重複／空白圖片卡片。明確重開才使用 `ngini_get_result`。
- 區分工具查詢失敗與已保存的任務失敗，修正帶 ID 查詢錯誤的有限重試，以及使用者明確重開同 ID 後恢復輪詢。
- 修正 production 下載錯誤未進入限定重試的問題；只重試既有原圖，最多額外兩次。取消、頻率限制、無效圖片及介面改變立即停止。獨占建立檔案，失敗只清理本次建立的檔案，等待中斷寫入結束後才重試。
- 正常結果維持可點擊圖片；服務意外產出多圖時揭露觀察到的數量，不假稱只生成一張。
- 227/227 完整離線、來源 stdio 與嚴格 CSP 通過。MCPB 與來源 ZIP 共用核對過的材料選取，排除未確認獨立授權的上游 recipes，固定來源連結另列；不把原生完全相同的重建當成自動發行門檻。
- 後續實機已確認安裝與一張普通聊天 fixture 原圖交付、提示詞不生成；發現舊交付訊息混淆本次顯示，以及模型在載入前加文字，另以 RC2 修正。沒有把 fixture 當作新 Ngini 生成。本條目不是正式版完成宣告，也未公開發布。

## 0.1.0-dev.15 — 2026-10-09, in development

- 另備 GitHub 開發版來源匯出、逐檔 SHA、貢獻與 issue／PR 範本、固定 action 的 Windows 離線 CI。拒絕越界／覆寫／連結及混入私密資料；原生授權未確認的 recipes 子樹不進公開來源。未公開 repository，也不改寫已封存的 dev.15 產物。
- 隔離來源 ZIP 重裝依賴、build、191 個預設離線案例與兩條 fixture stdio PASS；23 個需瀏覽器 opt-in 的案例未跑，24/24 自有 runtime 與固定候選相同。這不是乾淨 OS／Claude 安裝驗收。原生組件故障／恢復與三格式解碼檢查通過，完整修改後重建未跑。

- 修正 RequestStore 重啟時覆寫既有 failed 紀錄的問題，保留原始錯誤、checkpoint、未知提交與人工操作界線；不清除保守阻擋。
- 新增三種重啟回歸案例：未知提交、提交前人工驗證與已失敗逾時。最終 build、214/214 離線測試（18 檔、無失敗或跳過）、來源 7-tool stdio 與嚴格 CSP PASS。
- dev.15 MCPB 已固定；schema／archive／私密資料檢查、24 份自有 runtime 與 894 份 native 材料比對、隔離 7-tool stdio（1937 ms）PASS。使用者已更新；24/24 已安裝 runtime 位元組相同，最長 293 字元路徑的 native notice 存在且 SHA 相同。
- 保留 JSON 錯誤識別與阻擋任務 ID；正常等待先有界等待同一任務，支援時改由 App 輪詢，以減少重複圖片卡片。未宣告 App 能力的 host 保留模型查詢後備路徑；Claude dev.15 實機能力與 UI 尚待驗。
- dev.14 已完成普通聊天 fixture 預覽及原檔下載。自然中文請求初次被歷史任務 BUSY 阻擋，窄用途取消舊任務後，本輪唯一真實提交取得一張內容相符圖片並在原聊天預覽；dev.15 同 ID 重取一次、產生 1 張新卡片並保存原圖，79,422-byte JPEG 的原 SHA／完整解碼 PASS，沒有重新生成。
- dev.15 實際 App 只有可點擊圖片；模型仍在舊聊天加上說明文字。實際 delivery_mode／App 能力未觀察，慢速全新生成單卡片等待及背景視窗狀態未獨立驗證；跨版本核心鏈通過不等於本版全新端到端通過。
- 本輪 1 次授權已使用，不再追加提交。連同歷史共 6 次可能耗額嘗試、4 份不同 Ngini 結果，其中 1 份內容相符。

## 0.1.0-dev.14 — 2026-10-09

- 修正來源包第三方授權白名單、開發環境版本說明與原生材料重現前置。
- 審查並修正關閉／取消／持久化與圖片讀取邊界；具體回歸結果見測試文件。
- 保持一句短描述、原語言、一次提交與預設背景流程。
- 擁有者確認 MIT；整理公開文件、來源白名單與離線 CI、安全掃描。
- 不沿用歷史測試作為本版完整端到端成功；不自行公開 repository 或 release。
- 本版完整離線 200/200（17 檔）、schema／封包／來源安全掃描及隔離 stdio PASS；實機 fixture 交付 PASS 不等於匹配圖片端到端 PASS。

## Historical development candidates

- dev.12：加入背景瀏覽器及簡潔正常圖片卡片；安裝及離線驗證通過，真實背景流程未驗。
- dev.11：短描述及額度錯誤辨識；既有 fixture 原圖交付驗證。
- dev.8–10：版本化卡片、原圖分片下載、大圖驗證及交付狀態修正。
- dev.1–7：本機 MCP、專用瀏覽器、原圖驗證、防重複及初始卡片。

歷史共 5 次可能耗額提交，3 份結果內容不符。歷史候選不因後續修改而回填為成功。
