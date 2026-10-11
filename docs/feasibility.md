# 可行性與原型證據

目前候選來源及已安裝版本：**0.1.0-rc.11**。本案採 Windows 上 Claude Desktop 普通聊天，獨立 MCPB／stdio、專用持久化 Edge／Chrome、最小 MCP App 圖片交付。不是付費 API 或 Claude Code 限定方案。

| 階段 | 已有實證 | 未完成範圍 |
| --- | --- | --- |
| P0 聊天圖片／原檔 | RC1 實際 Claude fixture 預覽與使用者原檔保存、SHA／解碼 PASS | 不等於 Ngini 生圖 |
| P1 真實生成 | RC2 一次中文短描述提交、一張相符 JPEG，91,506 bytes、1344×768 | 小樣本，不推稱穩定成功率 |
| P2 原聊天交付 | RC2 同一對話預覽、原檔保存與 SHA／解碼 PASS | 模型多一句描述與一次查詢，整體 host FAIL；RC11 本版新生成 NOT_RUN |
| 簡潔回覆 | RC3 明確重開既有圖，一張卡片、無額外文字或狀態查詢 PASS | 不是新生圖；Claude 工具外框不能由外掛隱藏 |
| 背景模式 | RC2 9 次活躍程序採樣皆為 headless、無專用可見主視窗 | 有界採樣，不是連續錄影或新版實測 |
| 安裝及既有圖重開 | RC11 現有主機更新後 manifest／28 runtime 與候選相符；新普通聊天自動查一次同一張既有貓圖，單一卡片可見，新保存原檔 SHA／完整解碼 PASS | 嚴格無文字 FAIL；非新版新生成、全尺寸重測或乾淨安裝 |
| P3 錯誤與隱私 | 持續使用受控頁面、mock、原檔與有限封包檢查 | 新版結果見 testing；mock 不替代 host |
| P4 乾淨 Windows | 官方 ISO 驗證、專用 VM 已建立且關機；未安裝 guest | BLOCKED、未豁免。2026-10-10 08:09 可用 RAM 約 0.531 GiB，未達本案 6 GiB free 門檻，維持候選版 |

MCP App 是目前已在這臺 Claude Desktop 驗證的交付路線，不能宣稱原生附件。host 須支援 serverTools 與 downloadFile。只存本機、只回路徑、只有模型看見預覽、或 host 僅接受下載請求，都不構成交付完成。

固定歷史包及當時的 JSON／SHA 證據保留在本機，來源文件不得把未測結果填為通過。公開來源、GitHub 安裝包下載及官方目錄是分別的發行動作；尚未公開發布。RC4 的原始審查保留於 github-install-audit-rc4.md；修正後須另驗新產物。

免費額度剩餘未知，當前 live 預算為 0；fixture、重取與下載不消耗新生成授權。

2026-10-10 補充：[RC6 客戶端驗證](rc6-host-supplement-20261010.md) 與 [RC7 工具結果修正](rc7-audit-resolution.md) 分開記錄，固定歷史產物不覆寫。

本版詳細證據及缺口見 [RC11 驗收](acceptance-rc11.md)；RC10 空白結果造成的實機退化與撤回理由見 [相容性決策](host-result-compatibility.md)。原圖交付通過不代表嚴格無文字、乾淨安裝或正式發行通過。
