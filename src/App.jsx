import { useState, useEffect, useRef } from 'react'

// ── 顏色常數（台股慣例：紅漲綠跌）──
const UP   = '#c0392b'
const DOWN = '#27ae60'
const WARN = '#e67e22'

// ── 外資關卡計算 ──
const calcGates = (base, cur) =>
  [1.04, 1.20, 1.40, 1.70].map(m => {
    const price = +(base * m).toFixed(1)
    return {
      label:  `×${m.toFixed(2)}`,
      price,
      passed: cur >= price,
      diff:   +(cur - price).toFixed(1),
      pct:    +((cur - price) / price * 100).toFixed(1),
    }
  })

// ── 以台灣時間（Asia/Taipei）取得 YYYY-MM-DD ──
// 不用 toISOString()，因為那是 UTC，台灣早上 8 點前會變成前一天
const taipeiDate = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)

// ── 以台灣時間顯示日期與時間 ──
const formatTaipeiDateTime = (ts) =>
  new Date(ts).toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })

// ── 收盤後自動更新：判斷現在是否該自動抓股價 ──
// 條件：台灣時間平日（週一～五）、已過 14:30（13:30 收盤後 FinMind 需要時間更新當日資料），
// 且最後一次成功更新早於今天 14:30（早上手動更新過的盤中價，收盤後仍會再更新一次）
// 註：國定假日無法判斷，當天會抓到前一個交易日的收盤價，不影響結果
const AUTO_UPDATE_HOUR   = 14
const AUTO_UPDATE_MINUTE = 30
const taipeiWeekday = (d = new Date()) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', weekday: 'short' }).format(d)
const shouldAutoUpdate = (lastUpdated, now = new Date()) => {
  if (['Sat', 'Sun'].includes(taipeiWeekday(now))) return false
  const hh = String(AUTO_UPDATE_HOUR).padStart(2, '0')
  const mm = String(AUTO_UPDATE_MINUTE).padStart(2, '0')
  const todayCutoff = Date.parse(`${taipeiDate(now)}T${hh}:${mm}:00+08:00`)
  if (now.getTime() < todayCutoff) return false
  return !lastUpdated || lastUpdated < todayCutoff
}
const AUTO_CHECK_INTERVAL = 60 * 1000        // 網頁開著時每分鐘檢查一次
const AUTO_RETRY_INTERVAL = 30 * 60 * 1000   // 自動更新失敗後，30 分鐘後再試

// ── FinMind API 抓取股價 ──
async function fetchPrice(code, token) {
  try {
    const today = taipeiDate()
    const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${code}&start_date=${today}&token=${token}`
    const res  = await fetch(url)
    const json = await res.json()
    let data   = json.data || []

    // 今日無資料時，往前抓近期資料
    if (data.length === 0) {
      const pastDate = taipeiDate(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000))
      const url2 = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${code}&start_date=${pastDate}&token=${token}`
      const res2 = await fetch(url2)
      const json2 = await res2.json()
      data = json2.data || []
    }

    if (data.length > 0) {
      const latest = data.sort((a, b) => b.date.localeCompare(a.date))[0]
      return parseFloat(latest.close)
    }
    return null
  } catch {
    return null
  }
}

// ══════════════════════════════════════════════
// 個股卡片
// ══════════════════════════════════════════════
function StockCard({ stock, onEdit, onDelete }) {
  const { code, name, cat, shares, avg, price, base, status, note } = stock
  const gs      = base ? calcGates(base, price) : []
  const passed  = gs.filter(g => g.passed).length
  const pnl     = Math.round((price - avg) * shares)
  const pct     = +((price - avg) / avg * 100).toFixed(1)
  const borderC = status === '警戒' ? UP : status === '觀察' ? WARN : '#ccc'
  const stBg    = status === '警戒' ? '#fff5f5' : status === '觀察' ? '#fffde7' : '#f0fdf4'
  const stC     = status === '警戒' ? UP : status === '觀察' ? WARN : DOWN
  const hdrBg   = status === '警戒' ? '#7f1d1d' : status === '觀察' ? '#78350f' : '#14532d'

  return (
    <div style={{ border:`2px solid ${borderC}`, borderRadius:'8px', overflow:'hidden', marginBottom:'10px' }}>
      {/* 標題 */}
      <div style={{ background:'#111', padding:'9px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <span style={{ color:'#fff', fontWeight:'800', fontSize:'15px' }}>{code}　{name}</span>
          <span style={{ color:'#aaa', fontSize:'11px', marginLeft:'8px' }}>{cat}｜{shares.toLocaleString()} 股</span>
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
          <span style={{ background:hdrBg, color:'#fff', fontSize:'11px', padding:'3px 10px', borderRadius:'20px', fontWeight:'600' }}>
            {status}
          </span>
          <button onClick={() => onEdit(stock)}
            style={{ background:'#333', color:'#fff', border:'none', borderRadius:'4px', padding:'3px 8px', fontSize:'11px', cursor:'pointer' }}>
            ✏️ 編輯
          </button>
          <button onClick={() => onDelete(code)}
            style={{ background:'#7f1d1d', color:'#fff', border:'none', borderRadius:'4px', padding:'3px 8px', fontSize:'11px', cursor:'pointer' }}>
            🗑️
          </button>
        </div>
      </div>

      <div style={{ padding:'10px 14px' }}>
        {/* 損益 + 關卡概況 */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px', marginBottom:'8px' }}>
          <div style={{ background:pnl>=0?'#fdecea':'#e8f5e9', borderRadius:'4px', padding:'8px 10px', textAlign:'center' }}>
            <div style={{ fontSize:'10px', color:'#888' }}>損益（現價 {price.toLocaleString()} vs 均 {avg.toLocaleString()}）</div>
            <div style={{ fontSize:'19px', fontWeight:'800', color:pnl>=0?UP:DOWN }}>
              {pnl>=0?'+':''}{pnl.toLocaleString()} 元
            </div>
            <div style={{ fontSize:'11px', color:pnl>=0?UP:DOWN }}>{pct>=0?'+':''}{pct}%</div>
          </div>
          <div style={{ background:'#f5f5f5', borderRadius:'4px', padding:'8px 10px', textAlign:'center' }}>
            {base ? (
              <>
                <div style={{ fontSize:'10px', color:'#888' }}>外資關卡（基準 {base} 元）</div>
                <div style={{ fontSize:'19px', fontWeight:'800', color:passed>0?UP:'#555' }}>{passed} / 4 關突破</div>
                <div style={{ fontSize:'10px', color:'#888' }}>×1.04 / ×1.20 / ×1.40 / ×1.70</div>
              </>
            ) : (
              <>
                <div style={{ fontSize:'10px', color:'#888' }}>外資關卡</div>
                <div style={{ fontSize:'13px', color:'#bbb', marginTop:'8px' }}>未設定外資成本</div>
              </>
            )}
          </div>
        </div>

        {/* 四個關卡 */}
        {base && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'5px', marginBottom:'8px' }}>
            {gs.map((g, i) => (
              <div key={i} style={{
                border:`1.5px solid ${g.passed?UP:'#ddd'}`,
                borderRadius:'4px', padding:'6px 4px', textAlign:'center',
                background:g.passed?'#fdecea':'#fafafa',
              }}>
                <div style={{ fontSize:'9px', color:'#888' }}>{g.label}</div>
                <div style={{ fontSize:'13px', fontWeight:'800', color:g.passed?UP:'#333' }}>{g.price.toLocaleString()}</div>
                <div style={{ fontSize:'9px', color:g.passed?UP:'#888', fontWeight:g.passed?'600':'400' }}>
                  {g.passed ? `✅ +${g.pct}%` : `差 ${Math.abs(g.diff).toFixed(0)} 元`}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 備註 */}
        {note && (
          <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:'4px', padding:'6px 10px', fontSize:'11.5px', color:'#555' }}>
            📝 {note}
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════
// 新增 / 編輯 表單
// ══════════════════════════════════════════════
function StockForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState(initial || {
    code:'', name:'', cat:'', shares:'', avg:'', price:'', base:'', status:'觀察', note:''
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = () => {
    if (!form.code || !form.shares || !form.avg) {
      alert('請填入必要欄位：代號、持股數、均成本')
      return
    }
    onSave({
      ...form,
      code:   String(form.code).trim(),
      shares: parseFloat(form.shares),
      avg:    parseFloat(form.avg),
      price:  parseFloat(form.price) || parseFloat(form.avg),
      base:   form.base ? parseFloat(form.base) : null,
    })
  }

  const inputStyle = {
    width:'100%', padding:'7px 10px', border:'1px solid #ddd',
    borderRadius:'4px', fontSize:'13px', fontFamily:'inherit', boxSizing:'border-box'
  }
  const labelStyle = { fontSize:'11px', color:'#666', marginBottom:'3px', display:'block' }

  return (
    <div style={{ background:'#f9f9f9', border:'1px solid #ddd', borderRadius:'8px', padding:'16px', marginBottom:'16px' }}>
      <div style={{ fontWeight:'700', fontSize:'14px', marginBottom:'12px' }}>
        {initial ? '✏️ 編輯股票' : '➕ 新增股票'}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'10px', marginBottom:'10px' }}>
        <div>
          <label style={labelStyle}>股票代號 *</label>
          <input style={{ ...inputStyle, ...(initial ? { background:'#eee', color:'#888' } : {}) }}
            value={form.code} onChange={e=>set('code',e.target.value)} placeholder="例：2330"
            disabled={!!initial} title={initial ? '代號不可修改，如需更改請刪除後重新新增' : ''} />
        </div>
        <div>
          <label style={labelStyle}>股票名稱</label>
          <input style={inputStyle} value={form.name} onChange={e=>set('name',e.target.value)} placeholder="例：台積電" />
        </div>
        <div>
          <label style={labelStyle}>類別</label>
          <input style={inputStyle} value={form.cat} onChange={e=>set('cat',e.target.value)} placeholder="例：半導體" />
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:'10px', marginBottom:'10px' }}>
        <div>
          <label style={labelStyle}>持股數 * （張=1000）</label>
          <input style={inputStyle} type="number" value={form.shares} onChange={e=>set('shares',e.target.value)} placeholder="例：1000" />
        </div>
        <div>
          <label style={labelStyle}>均成本（元）*</label>
          <input style={inputStyle} type="number" value={form.avg} onChange={e=>set('avg',e.target.value)} placeholder="例：1555" />
        </div>
        <div>
          <label style={labelStyle}>現價（元，可留空）</label>
          <input style={inputStyle} type="number" value={form.price} onChange={e=>set('price',e.target.value)} placeholder="更新股價後自動填入" />
        </div>
        <div>
          <label style={labelStyle}>外資成本（元，可選）</label>
          <input style={inputStyle} type="number" value={form.base} onChange={e=>set('base',e.target.value)} placeholder="例：2112" />
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'12px' }}>
        <div>
          <label style={labelStyle}>持倉狀態</label>
          <select style={inputStyle} value={form.status} onChange={e=>set('status',e.target.value)}>
            <option value="持有">🟢 持有</option>
            <option value="觀察">🟡 觀察</option>
            <option value="警戒">🔴 警戒</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>備註（選填）</label>
          <input style={inputStyle} value={form.note} onChange={e=>set('note',e.target.value)} placeholder="例：法說後持續觀察" />
        </div>
      </div>

      <div style={{ display:'flex', gap:'8px' }}>
        <button onClick={handleSave} style={{
          padding:'8px 20px', background:'#111', color:'#fff', border:'none',
          borderRadius:'4px', fontSize:'13px', cursor:'pointer', fontWeight:'600'
        }}>
          {initial ? '儲存修改' : '新增股票'}
        </button>
        <button onClick={onCancel} style={{
          padding:'8px 20px', background:'#f0f0f0', color:'#333', border:'none',
          borderRadius:'4px', fontSize:'13px', cursor:'pointer'
        }}>
          取消
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════
// 主應用
// ══════════════════════════════════════════════
export default function App() {
  const STORAGE_KEY = 'stockPortfolioData'

  // ── 狀態 ──
  const [stocks,       setStocks]       = useState([])
  const [token,        setToken]        = useState('')
  const [tokenInput,   setTokenInput]   = useState('')
  const [showForm,     setShowForm]     = useState(false)
  const [editTarget,   setEditTarget]   = useState(null)
  const [loading,      setLoading]      = useState(false)
  const [loadResult,   setLoadResult]   = useState('')
  const [activeTab,    setActiveTab]    = useState('report') // 'report' | 'manage'
  const [lastUpdated,  setLastUpdated]  = useState(null)     // 最後成功抓取股價的時間（ms timestamp）
  const [loaded,       setLoaded]       = useState(false)
  const [autoUpdate,   setAutoUpdate]   = useState(true)     // 收盤後自動更新開關
  const lastAutoAttempt = useRef(0)                          // 上次自動更新嘗試時間，避免失敗時一直重試

  // ── 從 localStorage 讀取資料 ──
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      try {
        const data = JSON.parse(saved)
        setStocks(data.stocks || [])
        setToken(data.token || '')
        setTokenInput(data.token || '')
        setLastUpdated(data.lastUpdated || null)
        setAutoUpdate(data.autoUpdate !== false)
      } catch {}
    }
    setLoaded(true)
  }, [])

  // ── 存入 localStorage（讀取完成後，每次資料改變時自動存）──
  useEffect(() => {
    if (!loaded) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ stocks, token, lastUpdated, autoUpdate }))
  }, [stocks, token, lastUpdated, autoUpdate, loaded])

  // ── 新增股票（代號重複時詢問是否合併）──
  const handleAdd = (stock) => {
    const existing = stocks.find(s => s.code === stock.code)
    if (existing) {
      const merge = window.confirm(
        `${stock.code} 已在持倉中（${existing.shares.toLocaleString()} 股，均價 ${existing.avg}）。\n\n` +
        `按「確定」合併：股數相加並重新計算加權平均成本。\n按「取消」則不新增。`
      )
      if (!merge) return
      const shares = existing.shares + stock.shares
      const avg    = +((existing.shares * existing.avg + stock.shares * stock.avg) / shares).toFixed(2)
      setStocks(prev => prev.map(s => s.code === stock.code ? { ...s, shares, avg } : s))
      setShowForm(false)
      return
    }
    setStocks(prev => [...prev, stock])
    setShowForm(false)
  }

  // ── 編輯股票 ──
  const handleEdit = (updated) => {
    setStocks(prev => prev.map(s => s.code === updated.code ? updated : s))
    setEditTarget(null)
  }

  // ── 刪除股票 ──
  const handleDelete = (code) => {
    if (window.confirm(`確定要刪除 ${code} 嗎？`)) {
      setStocks(prev => prev.filter(s => s.code !== code))
    }
  }

  // ── 更新所有股價（FinMind API）──
  // auto = true 時為收盤後自動更新：沒有 Token 就靜默略過，結果訊息加上標示
  const updateAllPrices = async (auto = false) => {
    if (!token) { if (!auto) alert('請先設定 FinMind Token！') ; return }
    setLoading(true)
    setLoadResult('')
    let ok = 0, fail = 0
    const updated = [...stocks]
    for (let i = 0; i < updated.length; i++) {
      const price = await fetchPrice(updated[i].code, token)
      if (price !== null) {
        updated[i] = { ...updated[i], price }
        ok++
      } else {
        fail++
      }
    }
    setStocks(updated)
    if (ok > 0) setLastUpdated(Date.now())
    setLoading(false)
    const prefix = auto ? `🤖 收盤後已自動更新（${formatTaipeiDateTime(Date.now())}）　` : ''
    setLoadResult(`${prefix}✅ 成功 ${ok} 檔　${fail > 0 ? `❌ 失敗 ${fail} 檔` : ''}`)
  }

  // ── 收盤後自動更新：開網頁時檢查一次，之後網頁開著每分鐘檢查 ──
  const updateRef = useRef(updateAllPrices)
  updateRef.current = updateAllPrices
  useEffect(() => {
    if (!loaded || !autoUpdate || !token || stocks.length === 0) return
    const check = () => {
      if (loading) return
      if (Date.now() - lastAutoAttempt.current < AUTO_RETRY_INTERVAL) return
      if (!shouldAutoUpdate(lastUpdated)) return
      lastAutoAttempt.current = Date.now()
      updateRef.current(true)
    }
    check()
    const id = setInterval(check, AUTO_CHECK_INTERVAL)
    return () => clearInterval(id)
  }, [loaded, autoUpdate, token, stocks.length, lastUpdated, loading])

  // ── 儲存 Token ──
  const saveToken = () => {
    setToken(tokenInput.trim())
    alert('Token 已儲存！')
  }

  // ── 匯出 JSON（不含 Token，避免外洩）──
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ stocks, lastUpdated }, null, 2)], { type:'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `portfolio_${taipeiDate()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── 匯入 JSON ──
  const importJSON = (e) => {
    const file = e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result)
        setStocks(data.stocks || [])
        setLastUpdated(data.lastUpdated || null)
        // 舊版備份檔可能含 Token：一律忽略，不覆蓋目前設定
        alert('匯入成功！')
      } catch {
        alert('檔案格式錯誤，請確認是正確的 JSON 檔案')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── 損益計算 ──
  const totalUnreal = stocks.reduce((s, h) => s + (h.price - h.avg) * h.shares, 0)

  return (
    <div style={{ minHeight:'100vh', background:'#f8f8f8', fontFamily:"'Noto Sans TC', 'PingFang TC', sans-serif" }}>

      {/* 頂部 Header */}
      <div style={{ background:'#111', padding:'16px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ color:'#fff', fontWeight:'900', fontSize:'18px', letterSpacing:'2px' }}>📊 持倉監控工具</div>
          <div style={{ color:'#aaa', fontSize:'11px', marginTop:'2px' }}>資料自動儲存於瀏覽器　｜　台股慣例：紅漲綠跌</div>
        </div>
        <div style={{ display:'flex', gap:'8px' }}>
          <button onClick={() => setActiveTab('report')}
            style={{ padding:'7px 14px', background:activeTab==='report'?'#fff':'#333', color:activeTab==='report'?'#111':'#fff', border:'none', borderRadius:'4px', fontSize:'12px', cursor:'pointer', fontWeight:'600' }}>
            📋 報告
          </button>
          <button onClick={() => setActiveTab('manage')}
            style={{ padding:'7px 14px', background:activeTab==='manage'?'#fff':'#333', color:activeTab==='manage'?'#111':'#fff', border:'none', borderRadius:'4px', fontSize:'12px', cursor:'pointer', fontWeight:'600' }}>
            ⚙️ 管理
          </button>
        </div>
      </div>

      <div style={{ maxWidth:'900px', margin:'0 auto', padding:'20px 16px' }}>

        {/* ── 管理頁 ── */}
        {activeTab === 'manage' && (
          <div>
            {/* Token 設定 */}
            <div style={{ background:'#fff', border:'1px solid #ddd', borderRadius:'8px', padding:'16px', marginBottom:'16px' }}>
              <div style={{ fontWeight:'700', fontSize:'13px', marginBottom:'10px' }}>🔑 FinMind API Token 設定</div>
              <div style={{ fontSize:'12px', color:'#888', marginBottom:'8px' }}>
                前往 <a href="https://finmindtrade.com" target="_blank" rel="noreferrer" style={{ color:'#c0392b' }}>finmindtrade.com</a> 免費註冊取得 Token，用於自動抓取最新股價
              </div>
              <div style={{ display:'flex', gap:'8px' }}>
                <input
                  style={{ flex:1, padding:'7px 10px', border:'1px solid #ddd', borderRadius:'4px', fontSize:'13px', fontFamily:'monospace' }}
                  type="password"
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  placeholder="貼上你的 FinMind Token..."
                />
                <button onClick={saveToken}
                  style={{ padding:'7px 16px', background:'#111', color:'#fff', border:'none', borderRadius:'4px', fontSize:'13px', cursor:'pointer', fontWeight:'600' }}>
                  儲存
                </button>
              </div>
              {token && <div style={{ marginTop:'6px', fontSize:'11px', color:DOWN }}>✅ Token 已設定（儲存於瀏覽器）</div>}
            </div>

            {/* 收盤後自動更新開關 */}
            <div style={{ background:'#fff', border:'1px solid #ddd', borderRadius:'8px', padding:'16px', marginBottom:'16px' }}>
              <label style={{ display:'flex', alignItems:'center', gap:'8px', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}>
                <input type="checkbox" checked={autoUpdate} onChange={e => setAutoUpdate(e.target.checked)} />
                🕝 收盤後自動更新股價
              </label>
              <div style={{ fontSize:'12px', color:'#888', marginTop:'6px' }}>
                平日台灣時間 14:30 後，打開網頁（或網頁開著時）會自動抓一次當日收盤價。需要先設定 Token。
              </div>
            </div>

            {/* 操作按鈕列 */}
            <div style={{ display:'flex', gap:'8px', marginBottom:'16px', flexWrap:'wrap' }}>
              <button onClick={() => { setShowForm(true); setEditTarget(null) }}
                style={{ padding:'8px 16px', background:'#111', color:'#fff', border:'none', borderRadius:'4px', fontSize:'13px', cursor:'pointer', fontWeight:'600' }}>
                ➕ 新增股票
              </button>
              <button onClick={() => updateAllPrices()} disabled={loading}
                style={{ padding:'8px 16px', background:loading?'#aaa':'#1a5276', color:'#fff', border:'none', borderRadius:'4px', fontSize:'13px', cursor:loading?'not-allowed':'pointer', fontWeight:'600' }}>
                {loading ? '⏳ 更新中...' : '🔄 更新所有股價'}
              </button>
              <button onClick={exportJSON}
                style={{ padding:'8px 16px', background:'#1b5e20', color:'#fff', border:'none', borderRadius:'4px', fontSize:'13px', cursor:'pointer', fontWeight:'600' }}>
                📤 匯出備份
              </button>
              <label style={{ padding:'8px 16px', background:'#7d6608', color:'#fff', borderRadius:'4px', fontSize:'13px', cursor:'pointer', fontWeight:'600' }}>
                📥 匯入備份
                <input type="file" accept=".json" onChange={importJSON} style={{ display:'none' }} />
              </label>
            </div>

            {loadResult && (
              <div style={{ background:'#e8f5e9', border:'1px solid #a5d6a7', borderRadius:'4px', padding:'8px 12px', marginBottom:'12px', fontSize:'12px', color:'#1b5e20' }}>
                {loadResult}
              </div>
            )}

            {/* 新增表單 */}
            {showForm && !editTarget && (
              <StockForm onSave={handleAdd} onCancel={() => setShowForm(false)} />
            )}

            {/* 股票列表（管理用）*/}
            {stocks.length === 0 ? (
              <div style={{ textAlign:'center', padding:'40px', color:'#aaa', background:'#fff', borderRadius:'8px', border:'1px dashed #ddd' }}>
                <div style={{ fontSize:'40px', marginBottom:'8px' }}>📋</div>
                <div>還沒有任何股票，點擊「新增股票」開始</div>
              </div>
            ) : (
              <div>
                {stocks.map(s => (
                  <div key={s.code}>
                    {editTarget?.code === s.code ? (
                      <StockForm initial={editTarget} onSave={handleEdit} onCancel={() => setEditTarget(null)} />
                    ) : (
                      <StockCard stock={s} onEdit={setEditTarget} onDelete={handleDelete} />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 說明 */}
            <div style={{ background:'#fff8e1', border:'1px solid #fde68a', borderRadius:'6px', padding:'12px 14px', marginTop:'16px', fontSize:'12px', color:'#7d6608' }}>
              ⚠️ <strong>資料儲存說明：</strong>你的持倉資料存在這台電腦的瀏覽器中。清除瀏覽器快取或換電腦時資料會消失，請定期點「匯出備份」儲存 JSON 檔案。
            </div>
          </div>
        )}

        {/* ── 報告頁 ── */}
        {activeTab === 'report' && (
          <div>
            {/* 快速更新按鈕 */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
              <div style={{ fontSize:'12px', color:'#888' }}>
                {stocks.length} 檔持倉　｜　資料自動儲存於瀏覽器
              </div>
              <button onClick={() => updateAllPrices()} disabled={loading}
                style={{ padding:'7px 14px', background:loading?'#aaa':'#1a5276', color:'#fff', border:'none', borderRadius:'4px', fontSize:'12px', cursor:loading?'not-allowed':'pointer', fontWeight:'600' }}>
                {loading ? '⏳ 更新中...' : '🔄 更新股價'}
              </button>
            </div>

            {loadResult && (
              <div style={{ background:'#e8f5e9', border:'1px solid #a5d6a7', borderRadius:'4px', padding:'8px 12px', marginBottom:'12px', fontSize:'12px', color:'#1b5e20' }}>
                {loadResult}
              </div>
            )}

            {stocks.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px', color:'#aaa', background:'#fff', borderRadius:'8px', border:'1px dashed #ddd' }}>
                <div style={{ fontSize:'48px', marginBottom:'12px' }}>📊</div>
                <div style={{ fontSize:'16px', marginBottom:'8px', fontWeight:'600' }}>還沒有任何持倉資料</div>
                <div style={{ fontSize:'13px', marginBottom:'16px' }}>點擊右上角「管理」頁籤，開始新增你的股票</div>
                <button onClick={() => setActiveTab('manage')}
                  style={{ padding:'10px 24px', background:'#111', color:'#fff', border:'none', borderRadius:'4px', fontSize:'13px', cursor:'pointer', fontWeight:'600' }}>
                  ➕ 前往新增股票
                </button>
              </div>
            ) : (
              <>
                {/* 總覽 */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'8px', marginBottom:'14px' }}>
                  {[
                    { label:'持倉檔數',       val:`${stocks.length} 檔`,                                                   color:'#111' },
                    { label:'未實現損益（估）', val:`${totalUnreal>=0?'+':''}${Math.round(totalUnreal).toLocaleString()}元`, color:totalUnreal>=0?UP:DOWN },
                    { label:'最後更新',        val:lastUpdated ? formatTaipeiDateTime(lastUpdated) : '尚未更新',             color:'#888' },
                  ].map(item => (
                    <div key={item.label} style={{ background:'#fff', border:'1px solid #ddd', borderRadius:'6px', padding:'12px', textAlign:'center' }}>
                      <div style={{ fontSize:'10px', color:'#888', marginBottom:'4px' }}>{item.label}</div>
                      <div style={{ fontSize:'15px', fontWeight:'800', color:item.color }}>{item.val}</div>
                    </div>
                  ))}
                </div>

                {/* 個股卡片 */}
                <div style={{ fontSize:'13px', fontWeight:'700', marginBottom:'8px' }}>■ 個股持倉</div>
                {stocks.map(s => (
                  <StockCard key={s.code} stock={s} onEdit={s => { setEditTarget(s); setActiveTab('manage') }} onDelete={handleDelete} />
                ))}
              </>
            )}
          </div>
        )}

        <div style={{ textAlign:'center', fontSize:'10.5px', color:'#bbb', marginTop:'20px', lineHeight:1.7 }}>
          本工具資料來源為 FinMind API，僅供個人參考，不構成任何投資建議。<br/>
          資料存於瀏覽器本地，不會上傳至任何伺服器。
        </div>
      </div>
    </div>
  )
}
