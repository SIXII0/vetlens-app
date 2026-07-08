"""
VetLens OCR 微服务 —— 基于 Tesseract OCR + PIL 预处理

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
from PIL import Image, ImageFilter, ImageEnhance, ImageOps

app = Flask(__name__)
CORS(app)

# ---- Tesseract 配置 ----
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

# ---- 创建 user-words（常见宠物医疗术语，提升 Tesseract 识别率） ----
def _init_user_words():
    """在 TESSDATA_DIR 下创建 user-words 文件"""
    if not TESSDATA_DIR:
        return
    words_path = Path(TESSDATA_DIR) / 'user-words'
    if words_path.exists():
        return
    common_terms = [
        # 检查项目
        "血常规", "生化全套", "生化", "血检", "CR", "DR", "X光", "B超", "超声",
        "尿检", "便检", "镜检", "心电图", "血压", "血糖", "血气", "电解质",
        "ALT", "AST", "CREA", "BUN", "WBC", "RBC", "PLT", "TP", "ALB",
        # 治疗项目
        "输液", "注射", "清创", "缝合", "拔牙", "洗牙", "绝育", "驱虫",
        "疫苗", "狂犬", "三联", "四联", "六联", "体检", "住院", "护理",
        "留置针", "导尿管", "麻醉", "手术", "处方", "处方粮",
        # 药品
        "阿莫西林", "头孢", "恩诺沙星", "多西环素", "甲硝唑",
        "驱虫药", "心丝虫", "跳蚤", "蜱虫", "消炎", "止痛",
        # 耗材
        "一次性耗材", "注射器", "输液器", "敷料", "纱布", "棉签",
        "采血管", "止血带", "手术手套",
        # 服务
        "挂号费", "急诊挂号", "诊疗费", "检查费", "化验费",
        # 金额模式（帮助 Tesseract 正确识别小数）
        "¥", "￥", ".00", ".50",
    ]
    try:
        words_path.write_text("\n".join(common_terms), encoding="utf-8")
        print(f"[OCR Server] Created user-words: {len(common_terms)} terms")
    except Exception as e:
        print(f"[OCR Server] Failed to create user-words: {e}")

_init_user_words()


# ---- 图片预处理（提升 Tesseract 识别率） ----

def preprocess_for_ocr(image: Image.Image) -> Image.Image:
    """
    针对医疗账单优化的图片预处理：
    1. 放大到有效分辨率（≥300 DPI 等效）
    2. 灰度化
    3. 对比度增强
    4. 自适应阈值二值化（文字=黑，背景=白）
    5. 去噪
    """
    # 1. 放大：确保短边 ≥ 1500px（手机拍照通常 72 DPI，放大到 ~200 DPI 等效）
    w, h = image.size
    min_dim = min(w, h)
    if min_dim < 1500:
        scale = 1500 / min_dim
        new_w, new_h = int(w * scale), int(h * scale)
        image = image.resize((new_w, new_h), Image.LANCZOS)

    # 2. 灰度化
    if image.mode != 'L':
        image = image.convert('L')

    # 3. 对比度拉伸（增强文字与背景的对比度）
    # 使用 autocontrast：将最暗像素映射为黑，最亮像素映射为白
    image = ImageOps.autocontrast(image, cutoff=3)

    # 4. 锐化（使字符边缘更清晰）
    image = image.filter(ImageFilter.UnsharpMask(radius=1.5, percent=120, threshold=2))

    # 5. 自适应二值化：用大半径模糊得到局部背景，然后阈值
    # （模拟 adaptive threshold — PIL 无内置，用这种方式近似）
    blur = image.filter(ImageFilter.GaussianBlur(radius=15))
    # 逐像素比较：if pixel < blur_pixel - offset → black, else white
    offset = 8
    result = Image.new('L', image.size, 255)
    pix = image.load()
    blur_pix = blur.load()
    out_pix = result.load()
    for y in range(image.height):
        for x in range(image.width):
            if pix[x, y] < blur_pix[x, y] - offset:
                out_pix[x, y] = 0  # 文字 = 黑
            else:
                out_pix[x, y] = 255  # 背景 = 白

    return result


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

        # base64 → PIL Image
        image_bytes = base64.b64decode(image_b64)
        image = Image.open(io.BytesIO(image_bytes))
        if image.mode != 'RGB':
            image = image.convert('RGB')

        # ---- 预处理 ----
        image = preprocess_for_ocr(image)

        import tempfile
        with tempfile.NamedTemporaryFile(suffix='.png', delete=False) as tmp:
            image.save(tmp, format='PNG')
            tmp_path = tmp.name

        try:
            start = time.time()

            env = os.environ.copy()
            env['TESSDATA_PREFIX'] = TESSDATA_DIR

            # ---- 双 PSM pass 策略 ----
            # Pass 1: PSM 4 — 单列文本，适合竖排账单项目列表
            # Pass 2: PSM 3 — 全自动，作为兜底（识别标题、表头等）
            # 取两个结果中行数更多的（通常 PSM 4 对账单更准）

            results_all = []

            for psm, label in [(4, "column"), (3, "auto")]:
                result = subprocess.run(
                    [TESSERACT_PATH, tmp_path, 'stdout',
                     '-l', 'chi_sim+eng',
                     '--psm', str(psm),
                     '-c', 'tessedit_write_images=0',
                     '-c', 'user_words_suffix=user-words',
                     '-c', 'classify_enable_learning=0'],
                    capture_output=True, env=env, timeout=60,
                    encoding='utf-8', errors='replace'
                )

                if result.returncode == 0 and result.stdout:
                    text = result.stdout or ''
                    lines = [l.strip() for l in text.split('\n') if l.strip()]
                    results_all.append((label, lines, len(lines)))

            # 选择行数更多的结果（通常也是更完整的）
            if results_all:
                results_all.sort(key=lambda x: x[2], reverse=True)
                best_label, best_lines, best_count = results_all[0]
                elapsed = time.time() - start
                print(f"[OCR Server] PSM={best_label} selected ({best_count} lines), "
                      f"alternatives: {[(l, c) for l, _, c in results_all[1:]]}, "
                      f"耗时 {elapsed:.2f}s")

                results = [{"text": line, "confidence": 0.85} for line in best_lines]
            else:
                elapsed = time.time() - start
                print(f"[OCR Server] All PSM modes failed, 耗时 {elapsed:.2f}s")
                return jsonify({"status": "error", "error": "所有 PSM 模式均识别失败"}), 500

            return jsonify({
                "status": "ok",
                "results": results,
                "elapsed": round(elapsed, 2),
                "psm": best_label,
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
