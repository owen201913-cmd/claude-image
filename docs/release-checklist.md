# 發行檢查

正式版本 **0.1.0**，2026-10-12（Asia/Taipei）。本版按擁有者選擇採用範圍例外：乾淨 Windows P4 為 **NOT_RUN_USER_WAIVED**，不是 PASS。原生 VHDX 啟動 `0x7B` 後已返回原 Windows 11 Home；不推定原因或繼續 Windows 驗收。見 [例外紀錄](native-qa-waiver-20261012.md)、[正式驗收](acceptance-0.1.0.md) 及 [交付索引](release-0.1.0.md)。

## 0.1.0 發行範圍

- [x] MIT 授權、非官方整合與 Ngini 提示詞資料去向已說明；不宣稱原生 Claude 生圖、全程離線或原生附件。
- [x] 沿用 RC12 功能行為，發行只更新版本／manifest／文件。既有背景生成、卡片與原圖下載樣本按原版本記錄，不移轉為新 live。
- [x] 沿用 [RC12 完整受控 332/332 tests、54/54 suites PASS](test-results-rc12-single-worker-20261012.json) 與 [compiled App stdio 6 checks](protocol-app-card-rc12.json)；正式版未重跑 suite。原始失敗與歷史快照保留。
- [x] 0.1.0 build 與精確 UI 單項 CSP 檢查 PASS；其他兩項 CSP 案例未重跑，完整 suite 結果沿用 RC12。
- [x] 獨立 [Instructions 文字](../companion-instructions/ngini-image-replies.txt) 與 [帳號設定／撤回](image-only-setup.md) 已提供；保存後 1 個完整既有圖回合與 3 個必要文字控制 PASS。
- [x] 揭露 MCPB 單獨不能保證模型不附加文字、帳號設定影響所有聊天，單樣本不等於確定性靜默；原 MCPB-only／Skill FAIL 不改寫。
- [x] 擁有者於 2026-10-12 接受停止乾淨 Windows P4 驗收；安裝／更新／重啟／移除未驗收，記 NOT_RUN_USER_WAIVED。
- [x] 新增 live 0、剩餘真實提交預算 0；交付重試沿用 request_id，不重生圖。
- [ ] 新正式產物的實際生成／schema／SHA、application-source 與 native-source 搭配，由本輪 [交付索引](release-0.1.0.md) 記錄；此文件更新本身不是封包檢查結果。
- [ ] 公開 repository／Release 的授權及實際發布；目前只準備本機交付，沒有已驗證的公開下載 URL。
- [ ] GitHub HTTPS 下載／Actions 託管執行、現有主機生命週期與 host log 實機證據維持 NOT_RUN，不以離線測試代替。

## 歷史候選快照

以下保留 RC12 及更早版本當時的檢查與缺口；其中「未豁免／尚未開機／未改 BCD」等敘述不代表上述正式版當前決定。原始 JSON、安裝包及來源快照不改寫。
## RC12 歷史實驗候選狀態

- [x] 保留三項公開 facts／完整 own `_meta`；只為正常 ready 圖片結果加入固定簡短回覆規則，作為模型行為假設，不宣稱必然靜默。
- [x] 修正後聚焦測試 29/29 PASS；[compiled App stdio](protocol-app-card-rc12.json) 6 checks PASS。
- [x] 後續一次 [完整受控 RC12 suite](test-results-rc12-single-worker-20261012.json) 332/332 tests、54/54 suites PASS，0 failed／pending、約 40.9 秒；單 worker、原 20 秒 timeout、三項 browser flags／fixture 全開，0 真實生成。RC11 原始 full-suite FAIL 保留，不推定其唯一原因。
- [x] RC12 MCPB 已封存：18,218,016 bytes，SHA-256 `8fbdae4ed10877010ae0edfc50bd221046940d5702635aefeca74eb410f90101`。
- [x] [RC12 changed-contract 安裝核對](desktop-contract-install-rc12.json) PASS，範圍僅 manifest／changed artifact，不等於全 installed package 核對。
- [x] [宿主 B 新普通聊天](host-existing-cat-reopen-rc12.json) 自動選用 status + result、一張卡片可見 PASS；工具 inspector 可見固定回覆規則，不證明模型內部處理。既有貓圖 identity／提交時間未變，沒有全部任務計數比對。
- [ ] RC12 MCPB 單獨的嚴格只圖片 FAIL：完成回合附加兩段文字；fresh 原圖保存 NOT_RUN。沒有新增 live 或生圖驗收，不移轉 RC11 PASS。
- [x] 可選帳號技能 `ngini-image-replies` 的 [實際上傳／啟用與首輪貓圖預覽](host-existing-cat-reopen-skill-rc12.json) PASS，獨立於 MCPB。
- [ ] 獨立技能首輪嚴格只圖片 FAIL；實際載入 NOT_OBSERVED，不宣稱已載入規則被忽略。假說已依首輪失敗停止，其他技能案例／fresh 保存 NOT_RUN，新增 Ngini 提交 0。
- [x] [Instructions 帳號文字試驗](response-instructions-trial.md) 已實際保存：[一個完成的既有圖回合](host-existing-cat-reopen-instructions-rc12.json) 嚴格只圖片 PASS，來源問題／普通問答／查無任務 3 個控制 PASS，必要文字保留；原始錯誤碼未觀察。見 [設定與撤回](image-only-setup.md)。
- [ ] 帳號 Instructions 是各安裝者另行選擇、作用於所有聊天的設定，不由 MCPB 自動套用。單樣本不保證所有回合，舊 contract／Skill FAIL 與 fresh 保存 NOT_RUN 保留；不是完整發行驗收。
- [x] [管理員唯讀 native preflight](native-boot-preflight-20261012.json) QUALIFIED：C fully decrypted、NTFS／100 GiB 規劃餘裕、本機 basic GPT NVMe、UEFI，0 安全設定更動。
- [x] [保存的實際 DISM 媒體輸出](native-media-review-20261012.json) 已由 root 單獨核對唯一 zh-TW index 1；原 parser BLOCKED 保留，沒有改寫為 PASS。
- [x] [Native VHDX Phase A 實際結果](native-raw-resume-result-20261012.json) `OFFLINE_IMAGE_PREPARED_NOT_BOOTED`：同一份 80 GiB VHDX 映像套用完成，三份靜態轉移檔 bytes／SHA 相符、工作掛載點移除、ISO／VHDX 卸載，unknown／retained false；沒有第二份 VHDX。2026-10-12 早期 [準備快照](native-stage-preparation-20261012.json) 的「尚未建立 VHDX」及後續原 Stage 失敗仍是歷史，沒有改寫。
- [ ] Native 路線尚未開機或進行乾淨 Claude 安裝／更新／重啟／移除；P4 BLOCKED、未豁免，實際驗收 NOT_RUN_NOT_WAIVED。未更改 BCD／EFI、安全設定、未重啟或停止模擬器；Phase A 完成不等於 P4 PASS。

## RC11 歷史核對與缺口

- [x] 來源升版；正常 App 結果恢復三項公開身份資訊與完整 own `_meta`，檢查腳本恢復相同格式。不是已通過本版建置或 host 驗收。
- [x] RC11 TypeScript／UI 建置一次 PASS、exit 0／wall 7.912 秒；來源 App stdio 6 checks PASS。
- [ ] 完整受控 suite 首次 23 files／328 tests 為 327 PASS、1 CSP 20 秒 timeout FAIL／82.597 秒，保留 [原始失敗](offline-tests-rc11.json)，不稱為一次 328/328 PASS。
- [x] 僅 affected CSP 檔案 isolated single-worker 重測一次 3/3 PASS／12.974 秒，沒有增加 timeout；[重測](card-csp-retry-rc11.json) 與 [精確 HTML-CSP 證據](card-csp-smoke-rc11.json) 分開保存。
- [x] RC11 [包外 App stdio](protocol-app-card-bundle-rc11.json) 6 checks PASS：三項公開事實／完整 metadata、原檔 bytes／SHA、同 ID／去重、錯誤與 non-App 重啟。零瀏覽器／Ngini／Claude UI。
- [x] RC11 MCPB schema、[3,551 members 讀回](candidate-inspection-rc11.json)／精確 HTML-CSP 關聯，以及 [隔離協定](isolated-protocol-smoke-0.1.0-rc.11.json) 3 checks PASS；344 包內模組／0 包外，同圖／去重／重啟；不是乾淨 Windows／host 交付。
- [x] RC11 MCPB SHA-256 `3e92ad3d8b3304d810c4c4da44e4f3213554e3397c1e0b74a766f396d82ed8c6`，封存快照早於此封包後的 current-doc 補充，不重新 stage／封包。
- [x] RC11 source export 一次 1,021 declared files，manifest SHA `d86253f65eedddc0fad216aaba02e6435439dd0557a44acf7f59627ddc836bc8`；application-source ZIP 1,022 entries／2,619,484 bytes，SHA `0145dc7587491d757dbab6466594aab779c04658d583c83bee7f4bf11774504c`。
- [x] [來源快照重建](source-build-rc11.json) 一次 PASS／33.219 秒：fresh store／frozen lockfile、28/28 runtime byte exact、fixture stdio 8 tools；不重跑 suite／browser，非 native rebuild／clean Windows。
- [x] RC11 export／ZIP 保留早於重建報告與此 current-doc 補充的快照，舊版本及固定 MCPB 不改寫或重封包。
- [x] [RC11 native-source companion 關聯](native-source-companion-rc11.json) 窄幅 PASS：3 份 recorded native identity／12 份 selected small archived inputs 相同，沿用 RC8 fixed source；沒有重雜湊大型 archive／全 CRC／native rebuild。
- [x] 本機 [RELEASE RC11 索引](../release/RELEASE-0.1.0-rc.11.md) 保留寫入時 host NOT_RUN 的快照；[後續實機補充](../release/RELEASE-0.1.0-rc.11-host-supplement.md) 另列 installed／既有貓圖預覽／fresh 原圖／請求紀錄 PASS、嚴格只圖片 FAIL。原始 full-suite FAIL 與 affected retry PASS 各別保留；候選未公開、正式 NOT_PASSED。
- [x] 人工完成 RC11 更新，[installed own manifest／28 runtime](desktop-install-rc11.json) 相符；沒有重驗全部 installed package／其他 archive／native。
- [x] [installed served-resource 核對](installed-resource-inspection-rc11-20261012.json) **PASS**：2026-10-12 以 installed RC11 的隔離 stdio client 執行 readResource，HTML SHA-256 與既有 RC11 CSP 證據相符；5 項 App tools／2 項 ordinary tools、app-only visibility PASS，0 callTool／browser／新增 jobs／live。這不是實際 Claude iframe，也沒有新增 host 預覽或下載驗收。
- [x] RC11 [2026-10-10 新普通聊天重開既有貓圖](host-existing-cat-reopen-rc11.json)：自動選用 ngini_get_result 一次、一張卡片預覽 PASS；[fresh 原圖](host-cat-original-download-rc11.json) 91,506 bytes／1344 × 768／SHA／完整解碼／stable stat PASS。
- [x] [RC11 請求紀錄](host-request-state-rc11.json) 9→9，0 request／提交時間／圖片識別／來源變更；新增 Ngini 提交 0，沒有據此推算網站額度。
- [ ] 嚴格只圖片 **FAIL**：RC11 附加「已重新顯示該圖片卡片，未重新生成。」。舊 frame 遷移／refresh 必須獨立驗收，本次只測新普通聊天的一張既有貓圖。
- [ ] 實機重啟／更新／解除安裝／重裝資料保留及 host log privacy，不以 fixture 代替。
- [ ] **乾淨 Windows P4：BLOCKED，未豁免。** VM 已建立但關機；本輪 RAM 只測一次：2026-10-11T16:33:59.0428867Z（台北 2026-10-12 00:33:59）可用 2.82 GiB／總計 15.589 GiB，VM 設定 4 GiB。未滿專案保守的 6 GiB 可用記憶體餘裕閘門；這不是 Windows 官方最低要求。保留使用者指定的 Android 模擬器；使用者暫時無法釋放記憶體，維持候選版。guest 安裝與生命週期未驗收，沒有豁免本項或嚴格只圖片。
- [ ] 取得擁有者的公開 repository／Release 授權；目前未公開，無已驗證的公開安裝包 URL。
- [ ] GitHub HTTPS 下載、來源持續可取得與 Actions 託管執行，仍是獨立 NOT_RUN 項目。

## 最近歷史證據

RC10 工程／封包與安裝核對 PASS，但 [實際重開既有貓圖](host-existing-cat-reopen-rc10.json) 預覽與嚴格只圖片 FAIL、原圖保存 NOT_RUN；raw iframe metadata 未取得，不推定故障原因。見 [RC10 驗收](acceptance-rc10.md)。RC9 個別預覽、原檔保存與來源重建結果見 [RC9 驗收](acceptance-rc9.md)、[貓圖保存](host-cat-original-download-rc9-renamed.json) 與 [三份 TEST 保存](host-three-fixtures-download-rc9.json)；其嚴格只圖片仍 FAIL。所有固定包／export／來源 ZIP／原始報告保留，不把歷史結果列為 RC11 通過。

## RC8 已封存工程與產物

- [x] 初始化／工具描述調整圖片回覆規則；App client 下載回執處理已修改，backend 網頁生成／提交／去重／輪詢未改。
- [x] Production mock DOM 21/21：明確 10 分鐘 timeout／AbortSignal，已知錯誤與未知保存結果分開，不為未知回執回報 blocked telemetry；不自動下載重試／生圖／控制 host 確認框。
- [x] RC8 TypeScript／UI 建置 exit 0。
- [x] RC8 來源 stdio：正常 7／fixture 8 tools、版本 URI；文字 JSON／structuredContent 不含 next_action／私密欄位，同 ID 原圖及恢復防護 PASS。
- [x] RC8 完整受控單元／瀏覽器回歸一次：三項 browser flags 全開，22 files／305/305，0 failed／pending／todo／skip；raw JSON 起訖 36.071 秒。不是 Claude host 或 live Ngini。
- [x] RC8 官方 MCPB schema、28 份 runtime 清單、3,543 files archive==stage／安全路徑／CRC／包外解壓。
- [x] 精確 RC8 suite zero-height strict-CSP 報告與 dist／MCPB HTML 相符；沒有 CSP 重跑。初次舊 RC6 報告關聯 FAIL 保留，第二次候選讀回 PASS。
- [x] RC8 實際 MCPB 一次包外 protocol-only／fixture／重啟：正常 7／fixture 8 tools、原圖同 ID／SHA／重啟、344 包內模組／0 包外；browser NOT_RUN，不繼承歷史冷啟動 PASS。
- [x] RC8 finite first-party 來源掃描 1,087 files、0 項所掃描模式發現；不是全面秘密保證。
- [x] RC8 native-source：1,302 files、198,683,229 bytes、405 選定來源輸入、CRC／讀回及相鄰 SHA；不是 native rebuild 或法律認證。
- [x] RC8 已更新；3,543 installed files bytes／SHA 相符，runtime 28／native 材料 887；隔離 installed bootstrap UI8 HTML、5 App／2 普通 tools 與 0 新任務核對，非普通聊天 UI 驗收。
- [x] RC8 application-source／github-source：1,011 files、2,555,635 bytes、兩份 bytes 相同；manifest／完整 inventory／bytes／CRC／安全路徑及相鄰 SHA 讀回 PASS。
- [x] RC8 封存來源重建一次 PASS，33.251 秒；28/28 own runtime 等於固定 MCPB bytes，fixture stdio 8 tools；不是原生依賴重建或乾淨 Windows。
- [ ] 中英文文件、版本及包內相對連結與實際證據一致。

## RC8 歷史獨立門檻

- [x] RC8 原聊天延遲人工下載確認 UI 一例：框至少保持可見 102 秒，人工保存後無下載失敗狀態；原聊天 metadata 9 筆／0 新紀錄 PASS。此 UI 項目不代表實機拋錯回執分支通過；原檔另列驗證。
- [x] RC8 四份既有原檔一次限定 verifier：4/4 fresh exact filenames、原 bytes／SHA／full Sharp decode／stable stat PASS；兩次既有 metadata 比較 9→9、0 ID／提交／image identity SHA／source 變更。後者覆蓋全部 UI 讀取、早於檔案 verifier，不新增快照。
- [ ] RC8 原聊天、新普通聊天及受控三份 fixture：預覽與原檔下載 PASS、無額外模型文字 FAIL；見 [host 補充](rc8-host-supplement-20261010.md)。不推定舊聊天因果，已查核的 [協定邊界](image-only-host-boundary-rc8.md) 沒有強制完成文字靜默能力。
- [ ] RC8 新版真實生成完整驗收；NOT_RUN、live 預算 0。
- [ ] **乾淨 Windows x64 安裝／重啟／使用／更新／移除：BLOCKED，未豁免。**
- [ ] 擁有者授權公開 repository／release；目前未授權。
- [ ] GitHub HTTPS 下載、來源持續可取得及 Actions 實際託管執行；NOT_RUN。

RC7 歷史實機：三份 TEST／單張貓圖預覽 PASS，無額外模型文字回覆 FAIL。首輪 fixture 大圖保存 PASS、小／中圖缺少新保存證據；貓圖原始檔名新保存 SHA／解碼 PASS，指定檔名首次 FAIL 保留，後續卡片下載狀態正確性 FAIL，見 [RC7 補充](rc7-host-supplement-20261010.md)。SDK 60 秒預設是可能機制，實機唯一原因未確認。RC7 包外 --protocol-only 跳過 browser，明確 NOT_RUN；不是乾淨 Windows 或新生圖驗收。

RC7 固定產物保留封存時快照；歷史結果見 [RC7 審查](rc7-audit-resolution.md)。RC8 固定 MCPB SHA-256 `4be2e374d67699496992b35114bab1585f731b80500701d192c3171044ea9af5`，native-source SHA-256 `31e489b7247fdadce64f3846fd3e0f49277244057e453ff7e486b104dc10171f`，application／GitHub source SHA-256 `c9525f3700ea13874eabe078351465ca4a1992d86b8239deba74352dbf9b1b90`。固定來源於 2026-10-09T20:54:13.978Z 封存，文件早於本頁安裝／重建／host 補充；後續結果不回寫 MCPB／export／ZIP。原生 source rebuild、公開託管 CI 及法律認證未執行。

已知 upstream 通知閱讀問題：搬入通知資料夾的 `defmt-parser` README 仍連到 `../LICENSE-*`，實際 LICENSE-APACHE／LICENSE-MIT 在同一資料夾且原文已包含。保留 upstream bytes，不把搬移後的 README 相對連結寫成已修正。

公開授權及正式門檻通過後，依 [GitHub 準備](github-preparation.md) 發布；安裝包與 application-source、native-source、各份 SHA 及版本報告一同交付。原生來源約 198 MB，放 Release Assets；第三方授權獨立於 MIT，不稱法律認證。


[RC9 單張貓圖新保存補證](host-cat-original-download-rc9-renamed.json) PASS：實際保存為原 basename 的 `.jpg2.jpg` 改名檔，91,506 bytes、1344×768，與原圖 SHA-256／full Sharp decode／stable stat 相符；人工已確認在當前貓圖卡片保存。[初次 exact-name probe](host-cat-original-download-rc9.json) NOT_RUN、沒有讀取圖片 bytes，保留原報告。原實機觀察 JSON 不改寫，保存檔證據是後來的獨立補充，沒有宣稱追蹤 raw UI RPC 或每個人工 dialog 動作。9→9 任務比較是先前讀取後快照，不是下載後新增快照；嚴格只圖片仍 FAIL，中／大 fixture 的實際預覽、其他 RC9 host／乾淨 Windows 仍 NOT_RUN，新增 live 0。


[RC9 三份 TEST 保存補證](host-three-fixtures-download-rc9.json)：RC9 三份既有 TEST 原檔的新保存 3/3 bytes／SHA／full Sharp decode／stable stat PASS，兩個檔案時間均在基線後，0 舊圖片 bytes／新增 live；加上既有貓圖，共 4 份 RC9 新保存原檔通過。檔案 verifier 不觀察 UI。主代理另觀察小圖預覽及其三項模型結果 PASS；中／大圖實際預覽尚未目視驗證，NOT_RUN。三次 get_result 與 AX 最後文字已觀察：「三張圖都已依序重開一次（小圖、一般圖、大圖），未生成任何新圖片。」，批次嚴格只圖片 FAIL。
