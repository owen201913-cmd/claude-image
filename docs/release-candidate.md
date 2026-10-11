# 歷史候選紀錄（RC9 與更早版本）

目前正式版為 **0.1.0**，見 [本版驗收](acceptance-0.1.0.md)。本頁保留早期候選及失敗結果，以下不是目前發布狀態；乾淨 Windows 已免測，另外的帳號 Instructions 有單一無附加文字樣本。

2026-10-10（Asia/Taipei）。目前來源為 RC9，主代理回報建置一次 PASS；已安裝／固定候選為 RC9。本檢查點 RC9 MCPB schema／包外、manifest／28 own runtime 與隔離資源核對 PASS；新普通聊天既有單圖預覽／三項模型投影 PASS、嚴格只圖片 FAIL，單張貓圖新保存原檔 PASS，其餘 host／乾淨 Windows NOT_RUN，詳見 [RC9 驗收](acceptance-rc9.md)。以下為歷史 RC8 結果：工程、封包、來源 ZIP／重建及安裝核對通過。原聊天、新普通聊天及受控三份 fixture 預覽 PASS，完成回覆仍有模型文字，嚴格無文字 FAIL；延遲下載確認 UI 一例 PASS，四份既有原檔新保存 bytes／SHA／full decode／stable stat 與兩次讀取後 metadata 比較 PASS。詳見 [RC8 審查](rc8-audit-resolution.md)、[驗收](acceptance-rc8.md) 與 [host 補充](rc8-host-supplement-20261010.md)。

RC9 本版完整受控 suite 23 files／323/323 PASS、0 failed／pending／todo／skip，raw 24.474 秒、三 browser flags 全開；實際來源 stdio App-capability 6 checks PASS。只驗隔離 TEST、0 browser／live，不能取代 Claude metadata 轉送、下載或模型回覆。suite CSP 已另存精確 RC9 證據，並與固定 RC9 archive 的 HTML 核對相符，沒有 CSP 重跑。

固定 RC9 MCPB 為 18,188,435 bytes／3,547 files，SHA-256 `023b2863c16c48aecee6fcc6eb2e1c95d44055110ab100fa1b71886965e5c705`。官方 schema、包外 3,547 files 讀回／安全路徑／CRC 與精確 RC9 CSP HTML 關聯 PASS。實際包外 protocol-only 正常 7／fixture 8 tools、同 ID 原圖／重啟 PASS，344 包內模組、0 包外；browser NOT_RUN。另在該包外 bootstrap 執行 App-capability 6 checks PASS；這份 stdio 報告本身不獨立驗證 archive，需與 candidate-inspection-rc9.json 分開閱讀。

有限 first-party 掃描 1,094 files、0 項所掃描模式發現 PASS，不是全面秘密或 actual host 日誌保證。

RC9 MCPB 保留封包時的文件快照，早於上述包外報告與本次 current-doc 更新；不重新 stage／封包，也不將文件補充誤稱重建候選。本版來源 export／application-source ZIP 及一次隔離重建 PASS；額外 GitHub ZIP 未建立，application-source ZIP 已提供來源封包。[RC9 native companion 關聯](native-source-companion-rc9.json) PASS：已記錄 RC8／RC9 candidate inventories 的 3 份 DLL／NODE 路徑、bytes、SHA 完全相同；本輪核對 12 份 selected small archived inputs。沿用固定 RC8 native-source ZIP，不重新命名或重建 RC9 ZIP；既有大 archive SHA／完整 405-input 證據為歷史 RC8，本轮沒有重雜湊全部 binary／archive，也不是 native rebuild 或法律認證。已安裝 RC9；actual host 單圖預覽／三項模型投影 PASS，嚴格只圖片 FAIL、單張貓圖新保存原檔 PASS；其餘本版 host／乾淨 Windows NOT_RUN，未豁免、0 live。來源 export／ZIP 保留凍結當時快照，早於本次重建結果補充；後續只更新 current docs，不覆寫固定來源或 MCPB。

RC9 固定來源 export 為 1,017 份 declared source files，manifest SHA-256 `bded6392b19679365b06ea18e55fddcc56e0e1ea7b59714329cad3e866101819`；application-source ZIP 含 manifest 共 1,018 entries、2,597,519 bytes，SHA-256 `5308208db0a1b05ec85dacdfe91840193fb2b997dd0d63d94ba12dc67196caa1`。主代理實際 archive 檢查與隔離來源重建報告 source-build-rc9.json 核對一致；一次 fresh pnpm store／frozen-lockfile install 與 build 共 57.014 秒，28/28 own runtime 與固定 MCPB bytes 完全相同、fixture stdio PASS。使用既有開發 Windows，未重跑 suite／browser，也不是 clean Windows 或 native-source rebuild。

VirtualBox base 已由人工完成安裝，主代理核對安裝後 VBoxManage **7.2.20r175154**。VM／Windows／Claude guest、乾淨生命週期尚未建立／驗收，仍 NOT_RUN；VM 軟體安裝不能算 P4 PASS。詳見 [乾淨 Windows 實驗環境](clean-windows-lab-options-20261010.md)。

RC9 已更新：manifest 與 28/28 own runtime bytes／SHA 等於記錄的 candidate inventory；本輪沒有重驗全部 installed package/native。隔離 installed bootstrap 的 UI9 HTML、5 App／2 ordinary tools、App-only visibility PASS，0 新任務。實際 Claude Desktop 2.26454.2／Sonnet 5.5 的一個新普通聊天，以原 ID get_result 重開既有貓圖：一張正確預覽與 inspector 中 request_id、status=presenting、delivery_mode=app_poll 三項模型事實 PASS。最後仍加一句「已重新開啟該圖片的卡片。」，嚴格只圖片 FAIL。單張貓圖新保存改名檔 bytes／SHA／完整解碼／stable stat PASS；保存檔證據不宣稱追蹤每個人工確認動作，raw iframe metadata notification 未 instrument。

見 [RC9 單圖實機](host-existing-cat-reopen-rc9.json)、[安裝核對](desktop-install-rc9.json)、[隔離資源](installed-resource-inspection-rc9.json) 與 [任務前後比較](host-request-state-rc9.json)：9→9、0 ID／提交／image identity／source 變更。任務快照不是原檔保存或網站額度證據；本次新增 live 0、未公開。中／大 fixture 實際預覽、其他 RC9 host／舊 frame 遷移／生命週期／host log／乾淨 VM／Windows／Claude 仍 NOT_RUN。[RC9 T02](host-prompt-only-rc9.json) 一個新普通聊天 PASS：只回一句中文提示詞、沒有可見 tools／權限提示，own records 9→9 且 ID／提交／image identity／source 未變、新增 live 0；raw host RPC 未追蹤，不是全部意圖保證。

## RC9 目前變更與邊界

詳見 [RC9 模型／卡片結果邊界](rc9-card-result-boundary.md)。正常 app_poll 卡片／預覽移入 `_meta`；模型只收到協調用事實，必要錯誤／停止／多圖資訊仍可見，model_poll 保留完整後備輸出。此資料分離不能保證模型不加文字。新 RC9 frame 可接受舊結果；舊 RC8 frame 的 refresh／自動查詢不能假定接受新 narrow structuredContent。須以原 request_id 明確重開 RC9 卡片，實機遷移 NOT_RUN；不靠猜測 App-origin 標記放回完整資料，不重新生圖。

## RC8 固定候選與歷史證據

RC8 移除「圖片可見後」才停止文字回覆的條件；host 顯示狀態未知只限制交付宣稱，不自行變成錯誤旁白。必要錯誤與使用者主動詢問仍須如實回覆，工具結果沒有 next_action；這些描述不能保證 Claude 所有回覆都無文字。

App client 的 host download 使用明確 10 分鐘 timeout／AbortSignal，已知讀取／SHA／host 錯誤與未知保存回執分開。拋錯或本機中止不再斷言原檔未保存，也不送 blocked telemetry；不自動再下載、重送生圖或控制下載確認框。Backend 網頁生成／提交、去重與輪詢未改，runtime 白名單仍為 28 份。

固定候選為 `ngini-image-bridge-0.1.0-rc.8-win32.mcpb`，18,163,254 bytes／3,543 files，SHA-256 `4be2e374d67699496992b35114bab1585f731b80500701d192c3171044ea9af5`。官方 schema、stage／CRC／安全路徑讀回及實際包外 protocol 通過；browser 未在該 protocol-only 檢查重跑。初次舊 RC6 CSP 報告關聯 FAIL 另存，改用既有精確 RC8 suite 證據後驗證 PASS，不宣稱曾觀察到 CSP runtime 違規。

RC8 native-source 已固定，198,683,229 bytes／1,302 files，SHA-256 `31e489b7247fdadce64f3846fd3e0f49277244057e453ff7e486b104dc10171f`；405 選定來源輸入及 CRC／讀回 PASS，不是原生重建或法律認證。固定 RC8 與舊版本產物不覆寫；封包保留打包當時的文件快照，後續補充不重新打包。內部 extension 身份及使用者儲存目錄沿用。

已安裝的 3,543 files bytes／SHA 與固定候選相符，own runtime 28／native 材料 887；實際 installed bootstrap 的 UI8 HTML 與 5 App／2 普通 tools 在隔離資料下核對通過，0 新任務。這些檢查不能代替 Claude 普通聊天預覽、原檔保存或無額外文字驗收。

Application-source／GitHub-source 同為 2,555,635 bytes／1,011 files，SHA-256 `c9525f3700ea13874eabe078351465ca4a1992d86b8239deba74352dbf9b1b90`；manifest／完整 inventory／bytes／CRC／安全路徑驗證通過。本版來源重建一次 PASS，33.251 秒，28/28 runtime 與固定 MCPB bytes 相同、fixture stdio 8 tools。來源於 2026-10-09T20:54:13.978Z 封存，文件早於安裝、重建及 host 補充；export／ZIP bytes 保持原狀。

RC7 實機的三份 TEST／單張既有貓圖預覽 PASS，但單張及受控批次的無文字回覆 FAIL。首輪 fixture 大圖保存 PASS、小／中圖缺少新保存證據；貓圖原始檔名新保存 SHA／完整解碼 PASS，先前指定檔名的 FAIL 保留。後續卡片卻斷言下載未完成，狀態正確性 FAIL；實機唯一原因未確認。詳細證據見 [RC7 host 補充](rc7-host-supplement-20261010.md)，不得轉寫為 RC8 通過。

RC8 原聊天、新普通聊天及受控三圖無額外文字 FAIL，不能推定是舊對話造成。已查核協定沒有外掛可強制抑制 host 完成文字的標準能力，見 [圖片回覆邊界](image-only-host-boundary-rc8.md)。四份既有原檔 fresh bytes／SHA／full decode PASS；實機拋錯／中止回執分支及全新真實生成 NOT_RUN，live 預算 0。乾淨 Windows 完整生命週期 BLOCKED 且未豁免，維持候選。公開 repository／release 未授權，GitHub HTTPS 下載及託管 CI 未驗。

歷史累計 7 次可能耗額提交、5 份不同已取得原圖、2 份內容相符；不是網站總生成張數或剩餘額度。本輪新增提交 0 次。


[RC9 單張貓圖新保存補證](host-cat-original-download-rc9-renamed.json) PASS：實際保存為原 basename 的 `.jpg2.jpg` 改名檔，91,506 bytes、1344×768，與原圖 SHA-256／full Sharp decode／stable stat 相符；人工已確認在當前貓圖卡片保存。[初次 exact-name probe](host-cat-original-download-rc9.json) NOT_RUN、沒有讀取圖片 bytes，保留原報告。原實機觀察 JSON 不改寫，保存檔證據是後來的獨立補充，沒有宣稱追蹤 raw UI RPC 或每個人工 dialog 動作。9→9 任務比較是先前讀取後快照，不是下載後新增快照；嚴格只圖片仍 FAIL，中／大 fixture 的實際預覽、其他 RC9 host／乾淨 Windows 仍 NOT_RUN，新增 live 0。


[RC9 三份 TEST 保存補證](host-three-fixtures-download-rc9.json)：RC9 三份既有 TEST 原檔的新保存 3/3 bytes／SHA／full Sharp decode／stable stat PASS，兩個檔案時間均在基線後，0 舊圖片 bytes／新增 live；加上既有貓圖，共 4 份 RC9 新保存原檔通過。檔案 verifier 不觀察 UI。主代理另觀察小圖預覽及其三項模型結果 PASS；中／大圖實際預覽尚未目視驗證，NOT_RUN。三次 get_result 與 AX 最後文字已觀察：「三張圖都已依序重開一次（小圖、一般圖、大圖），未生成任何新圖片。」，批次嚴格只圖片 FAIL。
