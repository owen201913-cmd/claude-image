# RC11 候選驗收

2026-10-10（Asia/Taipei）。候選 `0.1.0-rc.11` 恢復最小三項公開事實與 App metadata 的交付格式，修復 RC10 空白回傳造成的相容性退化。**正式驗收 NOT_PASSED**；未公開 repository 或 release。

2026-10-12 [補充紀錄](../release/RELEASE-0.1.0-rc.11-resource-supplement-20261012.md)：已安裝 RC11 的獨立資源讀取核對通過。此項只驗證 installed server 提供的 UI 與工具 metadata，不是新的 Claude 畫面、下載或生圖測試；原有實機與套件證據保持原日期及範圍。

| 項目 | 狀態 | 證據／缺口 |
| --- | --- | --- |
| 針對性回歸 | PASS | 一次 4 files、64/64、1.26 秒；解析及 requested-ID guards 保留。零 Ngini／Claude |
| 本版建置 | PASS | 一次實際 TypeScript／UI 建置，exit 0，7.912 秒 wall time |
| 本版完整受控 suite | FAIL／受影響檔重測 PASS | [首次 327/328](offline-tests-rc11.json)，1 項 CSP 測試超過原 20 秒期限；未改 timeout，單獨重測 [3/3 PASS](card-csp-retry-rc11.json)。其餘 327 項不重跑，保留首次 FAIL；非 Claude host |
| 本版 App stdio | PASS | [6 checks](protocol-app-card-rc11.json)：三項公開事實、own metadata、同 ID、原圖分塊／雜湊、錯誤與非 App fallback。零 Ngini，非 Claude host |
| 本版 MCPB／包外核對 | PASS | 已封存 18,210,716 bytes／3,551 members，SHA-256 `3e92ad3d8b3304d810c4c4da44e4f3213554e3397c1e0b74a766f396d82ed8c6`。[封包讀回](candidate-inspection-rc11.json)、[包外隔離協定](isolated-protocol-smoke-0.1.0-rc.11.json) 3 checks／344 包內模組／0 包外，以及 [包外 App stdio](protocol-app-card-bundle-rc11.json) 6 checks PASS。零 browser／Ngini／Claude UI，不是 host／乾淨 Windows驗收；封存包保持原樣 |
| 本版安裝／普通聊天圖片與原圖保存 | PASS（限定範圍） | [安裝核對](desktop-install-rc11.json) 的 manifest／28 runtime 與封存包相符；[新普通聊天](host-existing-cat-reopen-rc11.json) 自動選用一次既有結果查詢，單一卡片貓圖可見。[新存原圖](host-cat-original-download-rc11.json) 91,506 bytes／1344×768 JPEG 完整解碼、SHA-256 與原檔一致；[請求紀錄](host-request-state-rc11.json) 9→9，無新增提交或圖檔身份變化。這是同一開發 Windows 上的更新與既有圖片測試，非乾淨安裝、本版新生成或完整安裝生命週期 |
| 已安裝版本的 served resource | PASS（限定範圍） | 2026-10-12 的[獨立 stdio 讀取](installed-resource-inspection-rc11-20261012.json) 確認 server 版本 RC11、versioned UI URI、HTML SHA-256 與 RC11 CSP 證據一致、5 App／2 普通工具及 App-only visibility。使用隔離資料與 HOME、空 PATH；0 callTool／0 browser／0 jobs／0 live。不是 actual Claude iframe 驗收，沒有重跑原始 CSP 測試 |
| 嚴格只圖片、不附加模型文字 | FAIL | RC11 在可見圖片下附加「已重新顯示該圖片卡片，未重新生成。」。完整記錄見 [實機結果](host-existing-cat-reopen-rc11.json)，未宣稱嚴格無文字通過 |
| 本版來源封存／隔離重建 | PASS | source export 一次 1,021 declared files；application-source ZIP 含 manifest 共 1,022 entries／2,619,484 bytes，SHA-256 `0145dc7587491d757dbab6466594aab779c04658d583c83bee7f4bf11774504c`。[來源快照重建](source-build-rc11.json) 一次 fresh store／frozen-lockfile PASS、33.219 秒、28/28 runtime byte exact、fixture stdio 8 tools；非 native rebuild／clean Windows。來源快照早於此重建報告與 current-doc 補充，MCPB／export／ZIP 不改寫；[native-source companion 關聯](native-source-companion-rc11.json) 窄幅 PASS：3 recorded native binaries／12 small inputs 與 RC8 相同，沿用歷史包；沒有重雜湊全部 native archive 或 native rebuild |
| 乾淨 Windows P4 | BLOCKED | 未豁免；VM 已建立、仍關機，Secure Boot 人工設定／Windows EULA／登入與安裝驗收未完成。2026-10-12 00:33:59（Asia/Taipei）的單次讀取顯示可用 RAM 約 2.82 GiB，仍未達本案 4 GiB guest 的保守 6 GiB free 啟動門檻；這是本案的餘裕設定，不是 Windows 官方最低需求。使用者暫時無法釋放記憶體、要求保留另一專案的 Android 模擬器並維持候選版；沒有啟動 VM 或關閉其他程式 |
| 新 Ngini 真實提交 | NOT_RUN | 本輪 0；剩餘 live 測試預算 0，不自動加測 |

[相容性決策](host-result-compatibility.md) 與 [RC10 實機失敗](host-existing-cat-reopen-rc10.json) 明確記錄撤回原因。RC10 所有固定產物與離線 PASS 保留，不能改寫成實機成功。歷史下載驗證是既有原圖，不是本版新生圖。
