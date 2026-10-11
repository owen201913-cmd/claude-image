# 乾淨 Windows：保存證據與返回

準備日期：2026-10-12（Asia/Taipei）。這份文件只供真人操作參考，不執行開機、BCD、VHDX 或檔案清理。原 Windows 項目的實際名稱是 **Windows 11**；新的 **Claude Image Clean Windows QA** 只是擬定名稱，準備本文件時尚未建立。只有 root 確認新項目與實際返回方式、並取得該次重啟授權後，才進入測試系統。

## 在測試 Windows 中

原系統的 Codex 與桌面工具不會跨 OS 重啟自動繼續；不要等待它們在新 Windows 接手。Windows 初次設定、官方 Claude 安裝登入、外掛權限、下載與重啟由你正常操作。不要為此安裝 Codex、Node、npm 或開發 runtime。

在允許的 QA 資料夾，用瀏覽器開啟 `clean-windows-evidence-recorder.html`。這份返回說明可用內建記事本閱讀。只使用新系統的本機 TEST fixture，確認診斷模式已實際載入；Ngini 真實提交預算為 **0**。來源不明就停止，不用生成來猜模式。

## 每一步留下可取回的證據

每個 G01–G10 階段完成或受阻後，依實際觀察填 PASS／FAIL／BLOCKED／NOT_RUN，再執行：

1. 按記錄頁的「匯出 JSON」，保存到 `C:\ClaudeImageQA`；保留有時間戳的檔名，不覆寫先前階段。
2. 用檔案總管確認這個 JSON **實際存在且大小非零**，記下精確檔名。下載提示或 localStorage 訊息不是保存完成的證據；沒保存成功就先停止，不進入下一個重啟／更新／移除步驟。
3. 將該階段從 Claude 卡片保存的 TEST 原檔放在 `C:\ClaudeImageQA\downloads`，另存而不改格式。記錄真實 request／image ID、工具原圖 bytes／SHA、下載檔名及必要的 TEST 畫面證據。不填帳號名、Email、憑證、cookies 或私人聊天。

localStorage 只方便同一瀏覽器暫存，不能代替 JSON 備份。開機切換之前再匯出最後一份並確認存在；root 回原系統後仍要核對實際資料，這些自記不會自動讓 P4 通過。

## 返回原 Windows 11

1. 確認最後的 JSON 與 TEST 原檔已保存，正常關閉這次測試工作。
2. 透過 Windows 的正常「重新啟動」流程，在開機選單選 **Windows 11** 返回原系統；不要選測試項目 **Claude Image Clean Windows QA**。
3. 若選單未出現或名稱不符，使用首次開機前已審閱的返回方式；不要猜 GUID、改 BCD／預設項目／開機時限、刪 VHDX 或用不明修復指令。本文件不能替代尚未確認的返回方案。
4. 回到原 Windows 後，開啟原 Codex 對話，交代測試實際完成到哪一步、最後 JSON 與下載檔名。等 root 有效連線後才繼續證據核對；不假設先前程序仍在執行。不要任意瀏覽或搬走原系統的其他資料。

返回不等於清理：開機項目與測試映像的移除交由 root 依精確 rollback 及另行授權處理。保留 QA 證據，不自行刪除映像或改開機設定。
