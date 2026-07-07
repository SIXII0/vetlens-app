@echo off
chcp 65001 >nul
title VetLens OCR Server

echo ========================================
echo   VetLens OCR 微服务 (EasyOCR)
echo ========================================
echo.

cd /d "%~dp0"

REM 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.9+
    echo 下载: https://www.python.org/downloads/
    pause
    exit /b 1
)

REM 检查依赖
echo [1/2] 检查依赖...
pip show easyocr >nul 2>&1
if errorlevel 1 (
    echo [安装] 正在安装 EasyOCR 依赖（首次需要几分钟）...
    pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
    if errorlevel 1 (
        echo [警告] 使用清华镜像安装失败，尝试默认源...
        pip install -r requirements.txt
    )
)

echo [2/2] 启动 OCR 服务...
echo.
echo 服务地址: http://localhost:8866
echo 健康检查: http://localhost:8866/health
echo.
echo 首次使用时会自动下载中文模型 (~200MB)，请耐心等待...
echo 关闭此窗口停止服务。
echo ========================================
echo.

python server.py

pause
