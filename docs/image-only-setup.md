# 只圖片回覆：安裝者選擇與設定

安裝 Claude Image 的 `.mcpb` **不會自動套用**這份回覆指示。這是另外追加到 Claude 帳號的文字設定，會作用於所有聊天；是否使用，由每位安裝者自行選擇。規則只針對 Claude Image 的成功圖片卡片回覆，保留錯誤、人工驗證、權限提示與明確問題所需的文字。

## 追加方式

1. 在 Claude Desktop 開啟 **Settings → 帳號 → 給 Claude 的指示**。
2. 保留欄位內原有文字。在末端追加空行，再貼上 [ngini-image-replies.txt](../companion-instructions/ngini-image-replies.txt) 的完整四段；不要替換整個欄位，也不要改寫下面已實測的文字。
3. 按 **儲存變更**。只有實際保存到這個欄位，指示才算已套用；把文字檔放在電腦或安裝包內不會自動生效。

追加的精確四段如下：

```text
Keep my other instructions unchanged. Apply this additional response-format rule only to the following narrow workflow.

When my current request only asks to generate one image or reopen an existing image through the installed Claude Image / Ngini tools, a normal app_poll image card is the complete reply. Complete any explicitly requested existing-image retrievals, then finish without an additional assistant message: no caption, title, description, completion sentence, recap, or rendering disclaimer. Let a pending App card update the original task; do not create duplicate cards or new generations merely to wait or retrieve a result.

Keep necessary text for returned errors or stopping states, human verification or permission handoffs, observed mismatches or unexpected image counts, reported display/download problems, and explicit questions about status, source, or use. Answer other requests normally. If asked about the image source, say Ngini.

These formatting instructions do not authorize any new generation, batch, retry, permission change, or hidden action. Preserve the user's language and explicit image requirements; do not generate when only a prompt is requested. Backend success alone does not prove an image is visible, matches the request, or was saved; make no unsupported delivery claim.
```

## 撤回方式

回到同一欄位，只刪除本次追加的四段，再按 **儲存變更**，保留其他原有文字。用開頭句 `Keep my other instructions unchanged.` 和結尾句 `Backend success alone does not prove an image is visible, matches the request, or was saved; make no unsupported delivery claim.` 辨識追加區段；不要把其他指示一起刪掉。

設定與撤回都在自己的 Claude 帳號內進行，不需要把私人指示、帳號資訊或登入憑證複製到聊天、測試報告或 repository。

## 已驗證範圍

本方案在 Claude Desktop 普通聊天有 **1 個既有圖片重開樣本 PASS**：一個正確圖片卡片，完整回合沒有模型附加正文；來源問題、普通算術與查無任務 **3 個控制案例 PASS**，均保留必要文字。[實測紀錄](response-instructions-trial.md)

這是單一圖片成功樣本，不保證所有回合或版本都能強制無字，也不代表 Claude host 提供靜默 API。先前的伴隨 Skill 雖已啟用，實際載入仍為 `NOT_OBSERVED`，沒有證實它是此方案的必要依賴；本設定步驟不要求安裝該 Skill。

## English

The MCPB does not apply these instructions automatically. This is an optional account-wide preference affecting every chat. In Claude Desktop, open **Settings → Account → Instructions for Claude**, keep your existing text, append the exact four paragraphs above, and select **Save changes**. To undo, remove only those added paragraphs, identified by their first and last sentences, and save again. Keep private instructions and credentials out of reports.

One existing-image reply and three controls passed. This is not a guarantee of text-free replies on every turn or version. The previously enabled companion Skill was not observed loading and is not a proven prerequisite.
