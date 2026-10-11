# Claude Image

在 Claude Desktop 聊天中描述畫面，生成一張圖片，並在同一對話預覽及下載原圖。網頁操作預設在背景進行，基本使用不需要 API key、額外帳號或手動複製提示詞。

[下載 Claude Image 0.1.0](https://github.com/owen201913-cmd/claude-image/releases/tag/v0.1.0) · [English](README.md) · [MIT 授權](LICENSE)

## 安裝

1. 使用 **Windows x64**、**Claude Desktop 2.26454.2 或較新版本**，以及標準安裝的 **Microsoft Edge 或 Google Chrome**。Claude 必須支援 MCP Apps 的圖片與檔案下載能力；較新版本未全部實測。
2. 到 [Release → Assets](https://github.com/owen201913-cmd/claude-image/releases/tag/v0.1.0) 下載 `.mcpb` 安裝包。**Code → Download ZIP** 與 **Source code (zip)** 是原始碼，不能直接安裝成外掛。
3. 雙擊 `.mcpb` 或拖入 Claude Desktop，完成 Claude 的安裝及權限確認。基本使用不用安裝 Node、執行 npm 或編輯 JSON。需要時可用同版 `.sha256` 核對檔案。
4. 保持「顯示網站瀏覽器」與「本機測試圖片」關閉，在新的普通聊天輸入：

   > 幫我畫：貓蜷縮在太空船窗邊睡覺

5. 圖片出現後，點圖片下載原檔，完成 Claude 的下載確認。

## 使用

**提示詞盡量簡短。** 直接寫一句畫面描述，例如「雨中的小木屋」。長提示詞可能導致誤解或生成錯誤。保留你的語言與指定條件，不強制英文，也不自行加風格；只要求寫提示詞時不生圖。

每次明確生圖要求只提交一次，目標交付一張圖。同時只處理一項任務；逾時或交付失敗時查詢原任務，不自動重新生圖。

每日免費量**估計約 5–10 次**，以服務當下額度及可用性為準。工具不提供額外額度、不付款、不繞過限制。遇額度用完、人工驗證、拒絕或登入要求時會停止並提示。

希望成功時只顯示圖片，可依 [只圖片回覆設定](docs/image-only-setup.md) 追加帳號 Instructions。這是另外選擇的設定，MCPB 不會自動套用；Claude 仍可能附加文字或顯示工具及權限介面。圖片以最小 MCP App 呈現，點擊即可下載原檔。

## 資料與限制

這是非官方擴充套件，生圖描述會送到 Ngini 處理；詳見 [隱私說明](PRIVACY.md)。不自動傳送整段對話、不讀取日常瀏覽器資料，也不收集 telemetry。原圖保留原始位元組，解除外掛不會刪除已保存圖片。

已實測的範圍及例外見 [0.1.0 發行說明](docs/release-0.1.0.md)。**乾淨 Windows 安裝／更新／重啟／移除驗收未執行，經擁有者免測（NOT_RUN_USER_WAIVED）**；macOS、ARM64、網頁及手機版尚未支援。只圖片回覆有單一成功樣本，不能保證所有回合都無附加文字。

## 開發

使用 Node >=24.15.0 與 pnpm 11.19.0；安裝包使用 Claude 內建 Node >=20.9.0。

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm test
pnpm run test:protocol
pnpm run verify:release
```

一般測試與 CI 僅使用離線及模擬頁面，不消耗生圖額度。打包前須按 [原生依賴來源說明](third_party/native/SOURCE_ACCESS.md) 準備相符材料，再執行 `pnpm run package`。

程式碼採 [MIT](LICENSE)，第三方依賴保留各自授權；生成圖片的使用權依服務規則而定。

[貢獻說明](CONTRIBUTING.md) · [安全](SECURITY.md) · [測試範圍](docs/testing.md) · [變更紀錄](CHANGELOG.md)