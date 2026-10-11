# RC9 驗收狀態

2026-10-10（Asia/Taipei）。目前來源為 **0.1.0-rc.9**；主代理回報本版建置一次 exit 0、完整受控 suite 23 files／323/323 PASS，以及實際來源 stdio App-capability 6 checks PASS。RC9 MCPB 已固定且完成 schema／包外核對，現有主機已更新至 RC9；actual host 單張既有圖預覽／三項模型投影 PASS，嚴格只圖片 FAIL，單張貓圖新保存原檔 bytes／SHA／完整解碼／stable stat PASS。其餘本版 host／乾淨 Windows 項目不沿用 RC8 的 PASS。

RC9 在 host 宣告 MCP Apps MIME 能力時，將完整卡片／預覽資料置於工具結果 `_meta["ngini-image-bridge/card"]`，正常模型 content／structuredContent 只保留 request_id、status 與 delivery_mode。錯誤、取消、耗盡額度及非預期多圖等必要事實仍向模型公開。未宣告 App 的 model_poll 後備路徑保留原有完整事實／模型預覽。這是資料投影改動，不能保證 Claude 不再寫完成文字。

RC9 已在現有主機更新，manifest 版本及 28/28 own runtime bytes／SHA 與記錄的 candidate inventory 相符；不宣稱本輪重新核對全部 3,547 installed files 或 native binary。隔離 installed bootstrap 精確 UI9 HTML、5 App／2 ordinary tools 與 App-only visibility PASS，0 新任務。詳見 [安裝核對](desktop-install-rc9.json) 與 [隔離資源核對](installed-resource-inspection-rc9.json)。

Claude Desktop 2.26454.2／Sonnet 5.5 的一個新普通聊天，以原 request_id 重開既有貓圖：一張正確圖片卡片預覽 PASS；實際工具結果 inspector 只見 request_id、status=presenting、delivery_mode=app_poll 三項模型事實，投影 PASS。卡片在窄公開結果下顯示既有原圖，但沒有 instrument raw iframe notification，不把實際 `_meta` 通訊追蹤宣稱已驗。最後仍加一句「已重新開啟該圖片的卡片。」，嚴格只圖片 FAIL。單張貓圖新保存檔案的 bytes／SHA／完整解碼／stable stat 已 PASS；這是獨立保存檔驗證，不宣稱已追蹤全部 UI RPC 或每個人工確認動作；既有圖重開不消耗新生圖額度。詳見 [RC9 單圖實機](host-existing-cat-reopen-rc9.json)。

詳細設計、實際 stdio 範圍及跨版處理見 [模型／卡片結果邊界](rc9-card-result-boundary.md)。

## 更新與舊卡片邊界

新 RC9 卡片可以讀 `_meta`，並接受舊的完整 structuredContent；帶有新的但損壞／身分不符 `_meta` 時會拒絕，不默默退回舊資料。反方向不同：已開啟的 RC8 frame 只讀 structuredContent，向 RC9 查 `ngini_get_result` 時，正常 app_poll 結果缺少舊 parser 必需的 message／image。此舊 frame 自動更新／refresh 不宣稱相容。

沒有可信的 App-origin 標記可據以保證只對舊 App 回傳完整模型資料。更新後若舊卡片無法查詢，遷移方式是由使用者明確要求以**原 request_id** 重開新的 RC9 卡片；不重新生圖。已存在的舊卡片原圖讀取／下載工具未改，但整個舊 frame 跨版操作與新卡片恢復仍需實際 host 驗證，不因程式檢視而標 PASS。

| 門檻 | RC9 狀態 | 範圍／缺口 |
| --- | --- | --- |
| TypeScript／UI 建置 | PASS | 主代理回報本版一次實際 build exit 0；本文件寫入者未重跑 |
| `_meta` 投影與 parser 受控回歸 | PASS | 本版完整受控 suite 包含新 envelope／parser／production UI 回歸；不是 actual Claude |
| 來源 stdio／App 宣告與 model_poll 後備 | PASS | protocol-app-card-rc9.json：6 checks、同 ID chunk 原 bytes／SHA、必要查詢錯誤、重啟後完整後備；隔離 TEST 任務 1、0 browser／live，不是 host 保存 |
| RC9 完整受控回歸／synthetic CSP | PASS | offline-tests-rc9.json：23 files／323/323，0 failed／pending／todo／skip、raw 24.474 秒、三 browser flags；精確 RC9 suite CSP 報告已另存，沒有重跑 |
| RC9 封包與 CSP 證據關聯 | PASS | candidate-inspection-rc9.json：精確 RC9 HTML SHA 與 suite CSP 證據相符；沒有 CSP 重跑 |
| RC9 schema／MCPB／包外檢查 | PASS | 3,547 files／18,188,435 bytes archive 讀回相符；包外 normal 7／fixture 8、同 ID／重啟、344 包內模組／0 包外，browser NOT_RUN |
| RC9 包外 App stdio | PASS | protocol-app-card-bundle-rc9.json：同 6 checks 在候選包外 bootstrap 通過；只準備 host 下載請求，不是 archive integrity 或 Claude 保存 |
| RC9 有限來源隱私掃描 | PASS | release-audit-rc9.json：1,094 first-party files、0 項所掃描模式發現；不是 actual host log 或全面秘密保證 |
| RC9 現有主機安裝核對 | PASS | desktop-install-rc9.json：manifest RC9、28/28 own runtime bytes／SHA 等於記錄 inventory；不是全部 installed package/native 或生命週期 |
| RC9 installed bootstrap 資源 | PASS | installed-resource-inspection-rc9.json：UI9 exact HTML、5 App／2 ordinary tools、App-only visibility；隔離 stdio，不是 iframe／保存 |
| RC9 source export／application-source ZIP | PASS | 1,017 declared source files、manifest 加入後 1,018 entries／2,597,519 bytes，固定 manifest 與 archive SHA 已核對；額外 GitHub ZIP 未建立 |
| RC9 固定來源隔離重建 | PASS | source-build-rc9.json：一次 fresh store frozen install／build 57.014 秒，28/28 runtime byte exact、fixture stdio PASS；非 clean Windows／native rebuild |
| RC9 native companion 關聯 | PASS | [本版關聯報告](native-source-companion-rc9.json)：3 份已記錄 native binary inventory 相同、12 small archived inputs 相同；沿用固定 RC8 archive，未重雜湊大包／重建 native |
| 新普通聊天既有單圖預覽／模型投影 | PASS | 一個 Claude Desktop 2.26454.2 樣本：原 ID get_result，一張正確貓圖、模型結果僅三項；raw iframe `_meta` 通訊未 instrument |
| RC9 三份 TEST 原檔新保存 | PASS | [本版 verifier](host-three-fixtures-download-rc9.json)：3/3 fresh bytes／SHA／full decode／stable stat；不觀察 UI，0 舊圖片 bytes／新增 live |
| RC9 三份 TEST 實際預覽 | NOT_RUN | 主代理小圖目視及三項模型結果 PASS；中／大圖尚未目視驗證，不能以三份保存檔推論預覽 |
| RC9 受控三圖嚴格只圖片 | FAIL | 主代理 AX 觀察三次 get_result 後仍加「三張圖都已依序重開一次（小圖、一般圖、大圖），未生成任何新圖片。」；不是三次生成 |
| 嚴格只回圖片 | FAIL | RC9 新普通聊天仍加「已重新開啟該圖片的卡片。」；模型結果已只含三項，資料分離不等於靜默 |
| 新保存原圖／雜湊／完整解碼 | PASS | [單張貓圖新保存報告](host-cat-original-download-rc9-renamed.json) PASS：實際改名檔 91,506 bytes、1344×768、SHA／完整解碼／stable stat 相符；最初 exact-name probe NOT_RUN 保留，不借用 RC8 4/4 |
| 新普通聊天同 ID 既有圖重開 | PASS | 本例 get_result 重開正確既有貓圖；[實際 own-record 比較](host-request-state-rc9.json) 9→9、0 ID／提交／image identity／source 變更；不代替原檔保存或供應商額度證據 |
| 跨版舊卡片遷移 | NOT_RUN | 本例新聊天不是舊 frame pending／refresh 遷移，限制仍保留 |
| T02 普通聊天只要提示詞 | PASS | [RC9 實機](host-prompt-only-rc9.json)：新普通聊天一例只回中文提示詞、0 可見 tools／權限提示，own records 9→9、無 ID／提交／image identity／source 變更；raw RPC 未追蹤，不是普遍保證 |
| 更新／移除／重裝資料保留 | NOT_RUN | 路徑與同 ID 復用是實作設計，需受控及 host 生命週期證據；不刪 user profile 或原圖來測 |
| T20 正常 runtime／actual host 日誌隱私 | NOT_RUN | 結果投影不是 host 日誌證據；RC8 指定 own-log filename 模式無符合檔案的 NOT_RUN 保留 |
| 實機拋錯／中止下載時未知回執分支 | NOT_RUN | RC8 delayed UI 一例 PASS 不能取代本版此分支 |
| 新普通聊天真實生成／語意準確 | NOT_RUN | live 預算 0，不新增生圖 |
| 乾淨 Windows 完整生命週期 | NOT_RUN | 主代理已核對安裝後 VBoxManage 7.2.20r175154；VM／Windows／Claude guest 及生命週期仍 NOT_RUN，VirtualBox 安裝不等於 P4 通過，未豁免 |
| 公開 repo／release／託管 CI | NOT_RUN | 未授權公開 |

固定 RC9 MCPB 為 18,188,435 bytes／3,547 files，SHA-256 `023b2863c16c48aecee6fcc6eb2e1c95d44055110ab100fa1b71886965e5c705`。官方 schema、包外 3,547 files 讀回／安全路徑／CRC 與精確 RC9 CSP HTML 關聯 PASS。實際包外 protocol-only 正常 7／fixture 8 tools、同 ID 原圖／重啟 PASS，344 包內模組、0 包外；browser NOT_RUN。另在該包外 bootstrap 執行 App-capability 6 checks PASS；這份 stdio 報告本身不獨立驗證 archive，需與 candidate-inspection-rc9.json 分開閱讀。

RC9 MCPB 保留封包時的文件快照，早於上述包外報告與本次 current-doc 更新；不重新 stage／封包，也不將文件補充誤稱重建候選。本版來源 export／application-source ZIP 及一次隔離重建 PASS；額外 GitHub ZIP 未建立，application-source ZIP 已提供來源封包。[RC9 native companion 關聯](native-source-companion-rc9.json) PASS：已記錄 RC8／RC9 candidate inventories 的 3 份 DLL／NODE 路徑、bytes、SHA 完全相同；本輪核對 12 份 selected small archived inputs。沿用固定 RC8 native-source ZIP，不重新命名或重建 RC9 ZIP；既有大 archive SHA／完整 405-input 證據為歷史 RC8，本轮沒有重雜湊全部 binary／archive，也不是 native rebuild 或法律認證。已安裝 RC9；actual host 單圖預覽／三項模型投影 PASS、嚴格只圖片 FAIL，單張貓圖新保存原檔 PASS。其他本版 host／乾淨 Windows NOT_RUN，未豁免、0 live。來源 export／ZIP 保留凍結當時快照，早於本次重建結果補充；後續只更新 current docs，不覆寫固定來源或 MCPB。

RC9 固定來源 export 為 1,017 份 declared source files，manifest SHA-256 `bded6392b19679365b06ea18e55fddcc56e0e1ea7b59714329cad3e866101819`；application-source ZIP 含 manifest 共 1,018 entries、2,597,519 bytes，SHA-256 `5308208db0a1b05ec85dacdfe91840193fb2b997dd0d63d94ba12dc67196caa1`。主代理實際 archive 檢查與隔離來源重建報告 source-build-rc9.json 核對一致；一次 fresh pnpm store／frozen-lockfile install 與 build 共 57.014 秒，28/28 own runtime 與固定 MCPB bytes 完全相同、fixture stdio PASS。使用既有開發 Windows，未重跑 suite／browser，也不是 clean Windows 或 native-source rebuild。

歷史 RC8 來源、MCPB、RELEASE、export／ZIP 與實機報告維持原狀。原圖重開／下載 PASS、模型額外文字 FAIL 各自保留，詳見 [RC8 驗收](acceptance-rc8.md)、[host 補充](rc8-host-supplement-20261010.md) 與 [圖片回覆協定邊界](image-only-host-boundary-rc8.md)。此頁不修改固定產物或增加工具呼叫、測試、Ngini 提交。


[RC9 單圖讀取前後任務比較](host-request-state-rc9.json) PASS：9→9，未新增／遺失 ID，submitted_at、完整 image identity 與 source 均未變。這個快照不驗證下載原檔或網站剩餘額度，新增 live 0。


[RC9 單張貓圖新保存補證](host-cat-original-download-rc9-renamed.json) PASS：實際保存為原 basename 的 `.jpg2.jpg` 改名檔，91,506 bytes、1344×768，與原圖 SHA-256／full Sharp decode／stable stat 相符；人工已確認在當前貓圖卡片保存。[初次 exact-name probe](host-cat-original-download-rc9.json) NOT_RUN、沒有讀取圖片 bytes，保留原報告。原實機觀察 JSON 不改寫，保存檔證據是後來的獨立補充，沒有宣稱追蹤 raw UI RPC 或每個人工 dialog 動作。9→9 任務比較是先前讀取後快照，不是下載後新增快照；嚴格只圖片仍 FAIL，中／大 fixture 的實際預覽、其他 RC9 host／乾淨 Windows 仍 NOT_RUN，新增 live 0。


[RC9 三份 TEST 保存補證](host-three-fixtures-download-rc9.json)：RC9 三份既有 TEST 原檔的新保存 3/3 bytes／SHA／full Sharp decode／stable stat PASS，兩個檔案時間均在基線後，0 舊圖片 bytes／新增 live；加上既有貓圖，共 4 份 RC9 新保存原檔通過。檔案 verifier 不觀察 UI。主代理另觀察小圖預覽及其三項模型結果 PASS；中／大圖實際預覽尚未目視驗證，NOT_RUN。三次 get_result 與 AX 最後文字已觀察：「三張圖都已依序重開一次（小圖、一般圖、大圖），未生成任何新圖片。」，批次嚴格只圖片 FAIL。
