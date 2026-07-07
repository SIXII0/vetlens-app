"""
skill_bridge.py — VetLens ↔ PetVault Skill 桥接

接收 JSON 输入，直接构造 materials_index 并调用 skill 的报告生成 + LaTeX + PDF 管线。
严格匹配 pet-vault-skill 内置的 LaTeX 模板格式。

用法:
  python skill_bridge.py --input-data input.json --output-dir ./output --report-type bill_explain
"""

import argparse, json, sys
from pathlib import Path
from datetime import datetime

# 把 skill 目录加入路径
SKILL_SCRIPTS = Path(__file__).resolve().parent.parent.parent.parent.parent / ".claude" / "skills" / "pet-vault-skill" / "scripts"
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


def build_materials_index(input_data: dict) -> dict:
    """从 VetLens 的结构化数据构造 skill 风格的 materials_index"""
    materials = []

    items = input_data.get("items", [])
    hospital_name = input_data.get("hospitalName", "")
    visit_date = input_data.get("visitDate", "")
    pet_name = input_data.get("petName", "待确认")
    diagnosis = input_data.get("diagnosis", "")
    total_amount = input_data.get("totalAmount", 0)

    # 构造一个"账单"类型的材料
    # 宠物档案信息
    pet_info = input_data.get("petInfo") or {}
    pet_species = pet_info.get("species", "")
    pet_breed = pet_info.get("breed", "")
    pet_gender = pet_info.get("gender", "")
    pet_birth = pet_info.get("birthDate", "")
    pet_weight = pet_info.get("weightKg", "")

    text_lines = [
        f"宠物医院账单",
        f"医院: {hospital_name}",
        f"日期: {visit_date}",
        f"宠物: {pet_name}",
    ]
    # 加入宠物基本信息
    if pet_species:
        text_lines.append(f"种类: {pet_species}")
    if pet_breed:
        text_lines.append(f"品种: {pet_breed}")
    if pet_gender:
        text_lines.append(f"性别: {pet_gender}")
    if pet_birth:
        text_lines.append(f"出生日期: {pet_birth}")
    if pet_weight:
        text_lines.append(f"体重: {pet_weight} kg")

    if diagnosis:
        text_lines.append(f"诊断: {diagnosis}")

    text_lines.append("")
    text_lines.append("费用明细:")
    for item in items:
        text_lines.append(f"{item['name']}  ¥{item['amount']:.2f}")

    text_lines.append(f"合计 ¥{total_amount:.2f}")

    text = "\n".join(text_lines)

    material = {
        "id": "mat_001_vetlens",
        "type": "bill",
        "pet_name": pet_name if pet_name != "待确认" else None,
        "clinic": hospital_name or None,
        "date": visit_date or None,
        "source_file": "vetlens_bill_data.md",
        "raw_path": "",
        "cleaned_markdown_path": "",
        "confidence": 0.95,
        "status": "extracted",
        "text": text,
    }
    materials.append(material)

    # 如果有宠物档案信息，添加为 pet_profile 材料
    if pet_species or pet_breed:
        profile_text = f"宠物名称: {pet_name}\n"
        if pet_species: profile_text += f"种类: {pet_species}\n"
        if pet_breed: profile_text += f"品种: {pet_breed}\n"
        if pet_gender: profile_text += f"性别: {pet_gender}\n"
        if pet_birth: profile_text += f"出生日期: {pet_birth}\n"
        if pet_weight: profile_text += f"体重: {pet_weight} kg\n"
        materials.append({
            "id": "mat_000_vetlens_pet",
            "type": "pet_profile",
            "pet_name": pet_name if pet_name != "待确认" else None,
            "clinic": None,
            "date": None,
            "source_file": "vetlens_pet_profile.md",
            "raw_path": "",
            "cleaned_markdown_path": "",
            "confidence": 0.99,
            "status": "extracted",
            "text": profile_text,
        })

    # 如果有诊断，添加一个"医疗报告"材料
    if diagnosis:
        med_text = f"诊断: {diagnosis}\n日期: {visit_date}\n医院: {hospital_name}\n宠物: {pet_name}"
        materials.append({
            "id": "mat_002_vetlens",
            "type": "medical_report",
            "pet_name": pet_name if pet_name != "待确认" else None,
            "clinic": hospital_name or None,
            "date": visit_date or None,
            "source_file": "vetlens_diagnosis.md",
            "raw_path": "",
            "cleaned_markdown_path": "",
            "confidence": 0.90,
            "status": "extracted",
            "text": med_text,
        })

    return {
        "materials": materials,
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }


def main():
    parser = argparse.ArgumentParser(description="VetLens ↔ PetVault Skill Bridge")
    parser.add_argument("--input-data", required=True, type=Path, help="JSON file with structured bill data")
    parser.add_argument("--output-dir", required=True, type=Path, help="Output directory for report artifacts")
    parser.add_argument("--vault-dir", required=False, type=Path, default=None, help="Vault directory (optional)")
    parser.add_argument("--report-type", default="auto", help="Report type")
    parser.add_argument("--pet-name", default=None, help="Pet name override")
    parser.add_argument("--pdf-policy", default="required", choices=["attempt", "required", "skip"])
    args = parser.parse_args()

    # 读取输入
    input_data = json.loads(args.input_data.read_text(encoding="utf-8"))
    args.output_dir.mkdir(parents=True, exist_ok=True)

    # 初始化 vault（可选）
    vault_dir = args.vault_dir or (args.output_dir / "vault")
    init_vault(vault_dir)

    # 构造 materials_index
    materials_index = build_materials_index(input_data)

    # 选择报告类型
    report_type = args.report_type
    if report_type == "auto":
        req = input_data.get("requestText", "").lower()
        if any(kw in req for kw in ["账单","费用","发票","bill","invoice"]):
            report_type = "bill_explain"
        elif any(kw in req for kw in ["理赔","保险","claim","insurance"]):
            report_type = "claim_check"
        elif any(kw in req for kw in ["转院","时间线","timeline","referral"]):
            report_type = "timeline"
        elif any(kw in req for kw in ["慢病","慢性","chronic"]):
            report_type = "chronic_review"
        elif any(kw in req for kw in ["检查报告","化验","lab","medical"]):
            report_type = "medical_summary"
        else:
            report_type = "general"

    pet_name = args.pet_name or input_data.get("petName") or UNKNOWN_TEXT

    # 1. 生成 Markdown 报告（使用 skill 内置逻辑）
    report_md, warnings = build_report_markdown(report_type, pet_name, materials_index)
    (args.output_dir / "report.md").write_text(report_md, encoding="utf-8")

    # 2. 生成 LaTeX（使用 skill 内置模板）
    report_tex = _render_tex(report_type, pet_name, report_md)
    (args.output_dir / "report.tex").write_text(report_tex, encoding="utf-8")

    # 3. 编译 PDF
    pdf_policy = args.pdf_policy
    skip_compile = pdf_policy == "skip"
    pdf_ok, pdf_log = compile_pdf(
        args.output_dir / "report.tex",
        args.output_dir,
        skip=skip_compile,
    )

    # 4. 生成 manifest
    manifest = {
        "report_id": "vetlens_br_001",
        "report_type": report_type,
        "title": REPORT_TITLES.get(report_type, REPORT_TITLES["general"]),
        "pet_name": pet_name,
        "generated_at": datetime.now().isoformat(),
        "material_count": len(materials_index.get("materials", [])),
        "routing_reason": f"vetlens-bridge, type={report_type}",
    }
    json_dump(args.output_dir / "manifest.json", manifest)

    # 5. 生成 QA 结果
    qa = {
        "passed": pdf_ok or skip_compile,
        "checks": [
            {"rule": "report.md exists", "passed": (args.output_dir / "report.md").exists(), "detail": ""},
            {"rule": "report.tex exists", "passed": (args.output_dir / "report.tex").exists(), "detail": ""},
            {"rule": "report.pdf exists", "passed": (args.output_dir / "report.pdf").exists() if not skip_compile else True, "detail": ""},
            {"rule": "manifest exists", "passed": (args.output_dir / "manifest.json").exists(), "detail": ""},
        ],
        "warnings": warnings,
    }
    if not pdf_ok and not skip_compile:
        qa["warnings"].append(f"PDF compile issue: {pdf_log[:200]}")
    json_dump(args.output_dir / "qa_result.json", qa)

    # 6. 写 build.log
    (args.output_dir / "build.log").write_text(pdf_log, encoding="utf-8")

    # 7. 输出摘要
    result = {
        "success": (args.output_dir / "report.md").exists(),
        "pdf_compiled": pdf_ok,
        "report_type": report_type,
        "output_dir": str(args.output_dir),
        "files": {
            "markdown": str(args.output_dir / "report.md"),
            "tex": str(args.output_dir / "report.tex"),
            "pdf": str(args.output_dir / "report.pdf") if (args.output_dir / "report.pdf").exists() else None,
            "manifest": str(args.output_dir / "manifest.json"),
            "qa_result": str(args.output_dir / "qa_result.json"),
            "build_log": str(args.output_dir / "build.log"),
        },
        "warnings": warnings,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


def _render_tex(report_type: str, pet_name: str, body_md: str) -> str:
    """使用 pet-vault-skill 内置 LaTeX 模板渲染 report.tex"""
    from jinja2 import Environment, BaseLoader, TemplateNotFound

    SKILL_DIR = SKILL_SCRIPTS.parent
    templates_dir = SKILL_DIR / "templates"

    # 读取模板文件
    styles_path = templates_dir / "styles.tex.j2"
    template_map = {
        "general": "report_general.tex.j2",
        "medical_summary": "report_medical_summary.tex.j2",
        "bill_explain": "report_bill_explain.tex.j2",
        "claim_check": "report_claim_check.tex.j2",
        "timeline": "report_timeline.tex.j2",
        "chronic_review": "report_chronic_review.tex.j2",
        "clinic_client_summary": "report_clinic_client_summary.tex.j2",
    }

    template_name = template_map.get(report_type, "report_general.tex.j2")
    template_path = templates_dir / template_name

    if not template_path.exists():
        # 回退到通用模板
        template_path = templates_dir / "report_general.tex.j2"

    styles = styles_path.read_text(encoding="utf-8") if styles_path.exists() else ""
    template_src = template_path.read_text(encoding="utf-8")

    # 将 Markdown 转为 LaTeX body
    latex_body = markdown_to_latex_body(body_md)

    # Jinja2 渲染
    env = Environment(loader=BaseLoader())
    template = env.from_string(template_src)

    return template.render(
        styles=styles,
        pet_name=pet_name,
        body=latex_body,
    )


if __name__ == "__main__":
    main()
