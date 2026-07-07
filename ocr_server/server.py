"""
VetLens OCR 微服务 —— 基于 Tesseract OCR

启动方式:
  python server.py
  → 监听 http://localhost:8866
"""
import sys
import os
import json
import base64
import io
import time
import traceback
import subprocess
import shutil
from pathlib import Path

from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image

app = Flask(__name__)
CORS(app)

# ---- Tesseract 配置 ----
# 查找 tesseract 可执行文件
TESSERACT_PATH = None
TESSDATA_DIR = None

# 1. 检查 scoop 安装
scoop_tess = os.path.expanduser('~/scoop/apps/tesseract/current')
scoop_shims = os.path.expanduser('~/scoop/shims/tesseract.exe')
if os.path.exists(scoop_shims):
    TESSERACT_PATH = scoop_shims
    TESSDATA_DIR = os.path.join(scoop_tess, 'tessdata')

# 2. 优先使用 C:\tesseract-data（纯 ASCII 路径，避免中文编码问题）
ascii_tessdata = 'C:/tesseract-data'
if os.path.exists(os.path.join(ascii_tessdata, 'chi_sim.traineddata')):
    TESSDATA_DIR = ascii_tessdata

# 3. 常规安装位置
if not TESSERACT_PATH:
    for p in [
        r'C:\Program Files\Tesseract-OCR\tesseract.exe',
        r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
        os.path.expanduser(r'~\AppData\Local\Programs\Tesseract-OCR\tesseract.exe'),
    ]:
        if os.path.exists(p):
            TESSERACT_PATH = p
            TESSDATA_DIR = os.path.join(os.path.dirname(p), 'tessdata')
            break

# 4. PATH 中查找
if not TESSERACT_PATH:
    TESSERACT_PATH = shutil.which('tesseract')

print(f"[OCR Server] Tesseract: {TESSERACT_PATH or 'NOT FOUND'}")
print(f"[OCR Server] Tessdata: {TESSDATA_DIR or 'NOT FOUND'}")


# ---- 路由 ----

@app.route('/health', methods=['GET'])
def health():
    langs = []
    if TESSERACT_PATH and TESSDATA_DIR:
        try:
            env = os.environ.copy()
            env['TESSDATA_PREFIX'] = TESSDATA_DIR
            result = subprocess.run([TESSERACT_PATH, '--list-langs'], capture_output=True, text=True, env=env, encoding='utf-8', errors='replace')
            langs = [l for l in result.stdout.split('\n') if l.strip()]
        except:
            pass

    return jsonify({
        "status": "ok",
        "available": TESSERACT_PATH is not None and TESSDATA_DIR is not None,
        "tesseract_path": TESSERACT_PATH,
        "tessdata_dir": TESSDATA_DIR,
        "languages": langs,
    })


@app.route('/ocr', methods=['POST'])
def ocr():
    try:
        data = request.get_json(force=True)
        if not data or 'image' not in data:
            return jsonify({"status": "error", "error": "缺少 image 字段"}), 400

        if not TESSERACT_PATH or not TESSDATA_DIR:
            return jsonify({
                "status": "error",
                "error": "Tesseract OCR 未安装。请运行: scoop install tesseract"
            }), 503

        image_b64 = data['image']
        if ',' in image_b64:
            image_b64 = image_b64.split(',', 1)[1]

        # base64 → 临时文件
        image_bytes = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(image_bytes))
        if image.mode != 'RGB':
            image = image.convert('RGB')

        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            image.save(tmp, format='PNG')
            tmp_path = tmp.name

        try:
            start = time.time()

            # 调用 tesseract
            env = os.environ.copy()
            env['TESSDATA_PREFIX'] = TESSDATA_DIR

            result = subprocess.run(
                [TESSERACT_PATH, tmp_path, 'stdout', '-l', 'chi_sim+eng', '--psm', '6'],
                capture_output=True, env=env, timeout=60,
                encoding='utf-8', errors='replace'
            )

            elapsed = time.time() - start

            if result.returncode != 0:
                return jsonify({"status": "error", "error": result.stderr or 'Tesseract returned non-zero'}), 500

            # 格式化结果
            text = result.stdout or ''
            results = []
            for line in text.split('\n'):
                line = line.strip()
                if line:
                    results.append({"text": line, "confidence": 0.85})

            print(f"[OCR Server] 识别完成: {len(results)} 行, 耗时 {elapsed:.2f}s")

            return jsonify({
                "status": "ok",
                "results": results,
                "elapsed": round(elapsed, 2)
            })

        finally:
            try:
                os.unlink(tmp_path)
            except:
                pass

    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "error": str(e)}), 500


# ---- 启动 ----
if __name__ == '__main__':
    port = int(os.environ.get('OCR_PORT', 8866))
    print(f"[OCR Server] 地址: http://localhost:{port}")
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
