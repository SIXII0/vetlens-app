"""
skill_bridge.py — 严格调用 pet-vault-skill 原生管线生成 PDF

数据流:
  JSON input → 构造 materials_index → skill build_report_markdown()
  → skill markdown_to_latex_body() → Jinja2 模板渲染 → XeLaTeX 编译 → PDF

用法:
  python skill_bridge.py --input-data input.json --output-dir ./output
"""

import argparse, json, sys
from pathlib import Path
from datetime import datetime

# pet-vault-skill 安装位置：优先查找 Codex skills 目录，然后是 .claude/skills
def find_skill_scripts() -> Path:
    """查找 pet-vault-skill 的 scripts 目录"""
    candidates = [
        Path.home() / ".codex" / "skills" / "pet-vault-skill" / "scripts",
        Path.home() / ".agents" / "skills" / "pet-vault-skill" / "scripts",
        Path(__file__).resolve().parent.parent.parent.parent.parent / ".claude" / "skills" / "pet-vault-skill" / "scripts",
    ]
    for dir in candidates:
        if dir.exists():
            return dir
    return candidates[0]  # fallback

SKILL_SCRIPTS = find_skill_scripts()
sys.path.insert(0, str(SKILL_SCRIPTS))

from petvault_core import (
    build_report_markdown,
    markdown_to_latex_body,
    compile_pdf,
    REPORT_TITLES,
    UNKNOWN_TEXT,
    json_dump,
    init_vault,
)
from jinja2 import Environment, BaseLoader


def build_materials_index(data: dict) -> dict:
    """从结构化数据构造 skill 格式的 materials_index"""
    items = data.get("items", [])
    h = data.get("hospitalName", "")
    d = data.get("visitDate", "")
    p = data.get("petName", "待确认")
    diag = data.get("diagnosis", "")
    total = data.get("totalAmount", 0)
    pi = data.get("petInfo") or {}

    # 按 skill 的 BILL_CATEGORIES 归类
    check_kw = ['生化','血','检','测','超','cr','x','ct','dr','b超','化验','镜']
    med_kw = ['药','针','剂','片','丸','胶囊','液','膏','霉素','西林','头孢','沙星','替尼','唑','芬','康','宁','坦','松','平']
    treat_kw = ['手术','处置','输液','缝合','清创','麻醉','拔牙','冲洗']
    supply_kw = ['导管','留置针','敷料','耗材','纱布','注射器','棉','手套']
    service_kw = ['挂号','诊疗','护理','服务','会诊','住院','观察','疫苗','驱虫','绝育','体检','美容']

    def classify(name: str) -> str:
        lo = name.lower()
        if any(k in lo for k in check_kw): return "检查"
        if any(k in lo for k in med_kw): return "药品"
        if any(k in lo for k in treat_kw): return "治疗"
        if any(k in lo for k in supply_kw): return "耗材"
        if any(k in lo for k in service_kw): return "服务"
        return "其他"

    lines = [f"宠物医院账单", f"医院: {h}", f"日期: {d}", f"宠物: {p}"]
    if pi.get("species"): lines.append(f"种类: {pi['species']}")
    if pi.get("breed"): lines.append(f"品种: {pi['breed']}")
    if pi.get("gender"): lines.append(f"性别: {pi['gender']}")
    if pi.get("birthDate"): lines.append(f"出生日期: {pi['birthDate']}")
    if pi.get("weightKg"): lines.append(f"体重: {pi['weightKg']} kg")
    if diag: lines.append(f"诊断: {diag}")

    cats: dict[str, list] = {}
    for it in items:
        c = classify(it["name"])
        cats.setdefault(c, []).append(it)
    for c in ["检查","药品","治疗","耗材","服务","其他"]:
        if c in cats:
            lines.append(f"\n{c}:")
            for it in cats[c]:
                lines.append(f"  {it['name']}  ¥{it['amount']:.2f}")
    lines.append(f"\n合计 ¥{total:.2f}")

    text = "\n".join(lines)
    materials = [{
        "id": "mat_001", "type": "bill",
        "pet_name": p if p != "待确认" else None,
        "clinic": h or None, "date": d or None,
        "source_file": "宠物医疗账单",
        "raw_path": "", "cleaned_markdown_path": "",
        "confidence": 0.95, "status": "extracted", "text": text,
    }]

    # 宠物档案
    if pi.get("species") or pi.get("breed"):
        pt = f"宠物名称: {p}\n"
        if pi.get("species"): pt += f"种类: {pi['species']}\n"
        if pi.get("breed"): pt += f"品种: {pi['breed']}\n"
        if pi.get("gender"): pt += f"性别: {pi['gender']}\n"
        if pi.get("birthDate"): pt += f"出生日期: {pi['birthDate']}\n"
        if pi.get("weightKg"): pt += f"体重: {pi['weightKg']} kg\n"
        materials.append({
            "id": "mat_000", "type": "pet_profile",
            "pet_name": p if p != "待确认" else None,
            "clinic": None, "date": None,
            "source_file": "宠物基础档案",
            "raw_path": "", "cleaned_markdown_path": "",
            "confidence": 0.99, "status": "extracted", "text": pt,
        })

    return {"materials": materials, "created_at": datetime.now().isoformat(timespec="seconds")}


def _sanitize_markdown(md: str) -> str:
    """预处理 Agent 生成的 Markdown，修复 LaTeX 不兼容格式"""
    import re
    # 0. 统一换行符 + 确保列表项独占一行
    md = md.replace('\r\n', '\n').replace('\r', '\n')
    # 在非行首的 `- ` 前插入换行（修复 LLM 将多个列表项挤在一行的问题）
    md = re.sub(r'(?<!\n)(?<!^)- (?!\s*-)', '\n- ', md)
    # 1. 移除 `> ` 引用标记内嵌的 `\n`（LaTeX 中会断开）
    # 2. 将 Markdown 表格转为缩进列表
    lines = md.split('\n')
    out = []
    in_table = False
    for line in lines:
        stripped = line.strip()
        # 检测表格行
        if stripped.startswith('|') and '|' in stripped[1:]:
            if '---' in stripped:
                in_table = True
                continue
            if in_table:
                # 表格数据行 → 缩进列表
                cells = [c.strip() for c in stripped.split('|') if c.strip()]
                if len(cells) >= 2:
                    out.append(f"- **{cells[0]}**: {', '.join(cells[1:])}")
                continue
        else:
            in_table = False
        out.append(line)
    # 3. 移除行内 `\n`（LaTeX 中会被识别为换行命令）
    result = '\n'.join(out)
    result = result.replace('\\\n', '\n').replace('\\\n', '\n')
    # 4. 修复编号列表中的 **粗体** 数字标记
    result = re.sub(r'^(\d+)\.\s*\*\*(.+?)\*\*', r'\1. \2', result, flags=re.MULTILINE)
    return result


def render_tex(report_type: str, pet_name: str, body_md: str) -> str:
    """使用 skill 内置 LaTeX 模板渲染"""
    SKILL_DIR = SKILL_SCRIPTS.parent
    tmpl = SKILL_DIR / "templates"
    styles = (tmpl / "styles.tex.j2").read_text(encoding="utf-8")

    name_map = {
        "general": "report_general.tex.j2", "medical_summary": "report_medical_summary.tex.j2",
        "bill_explain": "report_bill_explain.tex.j2", "claim_check": "report_claim_check.tex.j2",
        "timeline": "report_timeline.tex.j2", "chronic_review": "report_chronic_review.tex.j2",
        "clinic_client_summary": "report_clinic_client_summary.tex.j2",
    }
    tpl_path = tmpl / name_map.get(report_type, "report_general.tex.j2")
    if not tpl_path.exists():
        tpl_path = tmpl / "report_general.tex.j2"

    tpl_src = tpl_path.read_text(encoding="utf-8")
    latex_body = markdown_to_latex_body(body_md)
    return Environment(loader=BaseLoader()).from_string(tpl_src).render(
        styles=styles, pet_name=pet_name, body=latex_body)


def main():
    p = argparse.ArgumentParser(description="VetLens PetVault Skill Bridge")
    p.add_argument("--input-data", required=True, type=Path)
    p.add_argument("--output-dir", required=True, type=Path)
    p.add_argument("--report-type", default="auto")
    p.add_argument("--pet-name", default=None)
    p.add_argument("--pdf-policy", default="required", choices=["attempt","required","skip"])
    p.add_argument("--markdown", default=None, type=Path, help="Agent 预生成的 Markdown（跳过 build_report_markdown）")
    args = p.parse_args()

    data = json.loads(args.input_data.read_text(encoding="utf-8"))
    args.output_dir.mkdir(parents=True, exist_ok=True)

    # 选择报告类型
    rt = args.report_type
    if rt == "auto":
        req = data.get("requestText", "").lower()
        if any(k in req for k in ["账单","费用","发票","bill"]): rt = "bill_explain"
        elif any(k in req for k in ["理赔","保险","claim"]): rt = "claim_check"
        elif any(k in req for k in ["转院","时间线","timeline"]): rt = "timeline"
        elif any(k in req for k in ["慢病","慢性","chronic"]): rt = "chronic_review"
        elif any(k in req for k in ["检查报告","化验","lab"]): rt = "medical_summary"
        else: rt = "general"

    pn = args.pet_name or data.get("petName") or UNKNOWN_TEXT
    vault_dir = args.output_dir / "vault"
    init_vault(vault_dir)
    mi = build_materials_index(data)
    warnings = []

    # Markdown: Agent 预生成优先，否则用 skill 内置
    if args.markdown and args.markdown.exists():
        report_md = args.markdown.read_text(encoding="utf-8")
        # 预处理：修复 Agent 输出中的 LaTeX 不兼容格式
        report_md = _sanitize_markdown(report_md)
        print(f"[skill_bridge] 使用 Agent 预生成 Markdown ({len(report_md)} 字符)")
    else:
        report_md, warnings = build_report_markdown(rt, pn, mi)
        print(f"[skill_bridge] 使用 skill build_report_markdown")

    (args.output_dir / "report.md").write_text(report_md, encoding="utf-8")

    # LaTeX + PDF
    report_tex = render_tex(rt, pn, report_md)
    (args.output_dir / "report.tex").write_text(report_tex, encoding="utf-8")

    skip = args.pdf_policy == "skip"
    pdf_ok, pdf_log = compile_pdf(args.output_dir / "report.tex", args.output_dir, skip=skip)

    # Manifest + QA
    json_dump(args.output_dir / "manifest.json", {
        "report_id": "vetlens_001", "report_type": rt,
        "title": REPORT_TITLES.get(rt, "报告"), "pet_name": pn,
        "generated_at": datetime.now().isoformat(), "material_count": len(mi.get("materials",[])),
    })
    qa = {"passed": pdf_ok or skip, "checks": [
        {"rule":"report.md","passed":(args.output_dir/"report.md").exists(),"detail":""},
        {"rule":"report.tex","passed":(args.output_dir/"report.tex").exists(),"detail":""},
        {"rule":"report.pdf","passed":(args.output_dir/"report.pdf").exists() if not skip else True,"detail":""},
    ], "warnings": warnings}
    if not pdf_ok and not skip:
        qa["warnings"].append(f"PDF compile: {pdf_log[:200]}")
    json_dump(args.output_dir / "qa_result.json", qa)
    (args.output_dir / "build.log").write_text(pdf_log, encoding="utf-8")

    print(json.dumps({
        "success": (args.output_dir / "report.md").exists(),
        "pdf_compiled": pdf_ok,
        "report_type": rt,
        "output_dir": str(args.output_dir),
        "files": {
            "markdown": str(args.output_dir / "report.md"),
            "tex": str(args.output_dir / "report.tex"),
            "pdf": str(args.output_dir / "report.pdf") if (args.output_dir / "report.pdf").exists() else None,
        },
        "warnings": warnings,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
