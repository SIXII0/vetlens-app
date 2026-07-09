# VetLens 一键部署脚本 (Windows PowerShell)
# 以管理员身份运行: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned

Write-Host "🐱 VetLens 环境部署" -ForegroundColor Cyan
Write-Host "================================`n"

$errors = @()

# ── 1. Node.js ──
Write-Host "[1/6] Node.js..." -ForegroundColor Yellow
$nodeVersion = (node --version 2>$null) -replace 'v',''
if ($nodeVersion -and [int]($nodeVersion.Split('.')[0]) -ge 18) {
    Write-Host "  OK node v$nodeVersion" -ForegroundColor Green
} else {
    Write-Host "  未找到 Node.js >= 18。请从 https://nodejs.org 安装 LTS 版本" -ForegroundColor Red
    $errors += "Node.js"
}

# ── 2. Python ──
Write-Host "[2/6] Python..." -ForegroundColor Yellow
$pyVersion = (python --version 2>$null) -replace 'Python ',''
if ($pyVersion) {
    Write-Host "  OK Python $pyVersion" -ForegroundColor Green
} else {
    Write-Host "  未找到 Python。请从 https://python.org 安装 Python 3.11+" -ForegroundColor Red
    $errors += "Python"
}

# ── 3. Tesseract OCR ──
Write-Host "[3/6] Tesseract OCR..." -ForegroundColor Yellow
$tess = Get-Command tesseract -ErrorAction SilentlyContinue
if ($tess) {
    Write-Host "  OK tesseract found: $($tess.Source)" -ForegroundColor Green
} else {
    Write-Host "  未找到 Tesseract。正在通过 scoop 安装..." -ForegroundColor Yellow
    $scoop = Get-Command scoop -ErrorAction SilentlyContinue
    if (-not $scoop) {
        Write-Host "  需要先安装 scoop: https://scoop.sh" -ForegroundColor Red
        $errors += "Tesseract (需要 scoop)"
    } else {
        scoop install tesseract
        scoop install tesseract-languages
    }
}

# ── 4. 中文语言包 ──
Write-Host "[4/6] Tesseract 中文语言包..." -ForegroundColor Yellow
$tessdata = "C:\tesseract-data"
if (-not (Test-Path $tessdata)) {
    New-Item -ItemType Directory -Path $tessdata -Force | Out-Null
}
if (Test-Path "$tessdata/chi_sim.traineddata") {
    Write-Host "  OK chi_sim.traineddata 已存在" -ForegroundColor Green
} else {
    Write-Host "  下载 chi_sim.traineddata..." -ForegroundColor Yellow
    try {
        Invoke-WebRequest -Uri "https://github.com/tesseract-ocr/tessdata/raw/main/chi_sim.traineddata" -OutFile "$tessdata/chi_sim.traineddata"
        Write-Host "  OK 下载完成" -ForegroundColor Green
    } catch {
        Write-Host "  下载失败，请手动从 https://github.com/tesseract-ocr/tessdata 下载 chi_sim.traineddata 放到 C:\tesseract-data\" -ForegroundColor Red
        $errors += "Tesseract 中文语言包"
    }
}

# ── 5. Python 依赖 ──
Write-Host "[5/6] Python 依赖..." -ForegroundColor Yellow
pip install flask flask-cors pillow jinja2 2>&1 | Out-Null
Write-Host "  OK flask flask-cors pillow jinja2" -ForegroundColor Green

# ── 6. npm 依赖 ──
Write-Host "[6/6] npm 依赖..." -ForegroundColor Yellow
npm install 2>&1 | Out-Null
Write-Host "  OK" -ForegroundColor Green

# ── .env 模板 ──
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "`n📝 已创建 .env，请编辑填入 API Key:" -ForegroundColor Cyan
    Write-Host "   DOUBAO_API_KEY=你的豆包key" -ForegroundColor White
    Write-Host "   AMAP_WEB_KEY=你的高德Web端key" -ForegroundColor White
    Write-Host "   AMAP_SERVICE_KEY=你的高德Web服务key" -ForegroundColor White
}

# ── 结果 ──
Write-Host "`n================================`n" -ForegroundColor Cyan
if ($errors.Count -eq 0) {
    Write-Host "✅ 环境就绪！运行:" -ForegroundColor Green
    Write-Host "   npm run dev:all    (一键启动 Web + OCR 服务器)" -ForegroundColor White
    Write-Host "   npm run dev        (仅 Web 服务器)" -ForegroundColor White
} else {
    Write-Host "⚠️  以下组件缺失，请手动安装:" -ForegroundColor Red
    $errors | ForEach-Object { Write-Host "   - $_" -ForegroundColor Red }
}
