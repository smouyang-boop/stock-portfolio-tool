# 持倉監控工具 — 部署說明

## 功能介紹
- 新增、編輯、刪除股票持倉
- 自動透過 FinMind API 抓取最新股價
- 外資關卡系統（×1.04 / ×1.20 / ×1.40 / ×1.70）
- 損益自動計算
- 資料存於瀏覽器（localStorage），不需登入
- 匯出 / 匯入 JSON 備份

---

## 部署到 Vercel（Step by Step）

### Step 1：申請 GitHub 帳號
前往 https://github.com 註冊免費帳號

### Step 2：建立 GitHub Repository
1. 登入 GitHub
2. 點右上角 ＋ → New repository
3. Repository name：stock-portfolio-tool
4. 選 Public
5. 點 Create repository

### Step 3：上傳程式碼
把這個資料夾（stock-tool）的所有檔案上傳到 GitHub
（可以用 GitHub Desktop 或直接拖曳上傳）

### Step 4：申請 Vercel 帳號
前往 https://vercel.com
點 Sign Up → Continue with GitHub（用 GitHub 帳號登入）

### Step 5：部署
1. Vercel 首頁點 New Project
2. 選你剛建立的 stock-portfolio-tool repository
3. Framework Preset 選 Vite
4. 點 Deploy
5. 等待 1-2 分鐘
6. 完成！Vercel 會給你一個網址

---

## 使用方式
1. 點右上角「管理」設定 FinMind Token
2. 新增你的股票（代號、持股數、均成本、外資成本）
3. 點「更新股價」自動抓取最新價格
4. 切換到「報告」頁查看損益和關卡

---

## 資料備份提醒
資料存在瀏覽器中，請定期點「匯出備份」儲存 JSON 檔案。
換電腦時用「匯入備份」還原資料。
