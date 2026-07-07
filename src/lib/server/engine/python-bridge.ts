/**
 * Python 桥接层 —— 调用 pet-vault-skill 的 Python 管线生成报告
 *
 * 依赖：
 * - Python 3.x + PyYAML + Jinja2
 * - XeLaTeX（MiKTeX / TeX Live）用于 PDF 编译
 * - pet-vault-skill 已安装到 .claude/skills/pet-vault-skill/
 */
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuid } from 'uuid';

const execFileAsync = promisify(execFile);

const SKILL_DIR = path.join(process.cwd(), '.claude', 'skills', 'pet-vault-skill');

/** 自动探测 Python 路径 */
function findPython(): string {
  // 优先使用环境变量
  if (process.env.PYTHON_PATH && fs.existsSync(process.env.PYTHON_PATH)) {
    return process.env.PYTHON_PATH;
  }
  // Windows 常见路径
  if (process.platform === 'win32') {
    // 扫描常见安装位置（包括多盘符）
    const drives = ['C:', 'D:', 'E:', 'F:'];
    const versions = ['Python313', 'Python312', 'Python311'];
    for (const drive of drives) {
      for (const ver of versions) {
        const p = path.join(drive, ver, 'python.exe');
        if (fs.existsSync(p)) return p;
      }
    }
    // LocalAppData 安装
    for (const ver of versions) {
      const p = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', ver, 'python.exe');
      if (fs.existsSync(p)) return p;
    }
    return 'python'; // fallback: hope it's in PATH
  }
  return 'python3';
}

const PYTHON = findPython();
console.log(`[PythonBridge] Python path: ${PYTHON}`);

const XELATEX_PATH = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA || '', 'Programs', 'MiKTeX', 'miktex', 'bin', 'x64')
  : '';

export interface PipelineOptions {
  /** 用户请求文本（如"帮我解释账单"） */
  requestText: string;
  /** 宠物名称 */
  petName?: string;
  /** 报告类型 */
  reportType?: 'auto' | 'general' | 'bill_explain' | 'claim_check' | 'timeline' | 'medical_summary' | 'chronic_review';
  /** PDF 策略 */
  pdfPolicy?: 'attempt' | 'required' | 'skip';
  /** 账单项目数据（转为文本文件作为管线输入） */
  billItems?: Array<{ name: string; amount: number }>;
  /** 医院名称 */
  hospitalName?: string;
  /** 就诊日期 */
  visitDate?: string;
  /** 分析引擎的解释文本（可选，作为额外材料） */
  analysisText?: string;
}

export interface PipelineResult {
  success: boolean;
  reportId: string;
  outputDir: string;
  pdfPath?: string;
  markdownPath?: string;
  texPath?: string;
  buildLog: string;
  error?: string;
}

/**
 * 调用 pet-vault-skill 的 run_pipeline.py 生成报告
 */
export async function runPetVaultPipeline(opts: PipelineOptions): Promise<PipelineResult> {
  const reportId = uuid();
  const pipelineScript = path.join(SKILL_DIR, 'scripts', 'run_pipeline.py');

  // 验证 Python 管线是否存在
  if (!fs.existsSync(pipelineScript)) {
    return {
      success: false, reportId, outputDir: '', buildLog: '',
      error: `pet-vault-skill 管线脚本未找到: ${pipelineScript}`,
    };
  }

  // 创建临时输入目录（包含账单数据文本文件）
  const inputDir = path.join(os.tmpdir(), `vetlens-pipeline-input-${reportId}`);
  const outputDir = path.join(os.tmpdir(), `vetlens-pipeline-output-${reportId}`);
  const vaultDir = path.join(process.env.PETVAULT_VAULT_DIR || path.join(os.homedir(), 'PetVault', 'vault'));

  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(vaultDir, { recursive: true });

  try {
    // 构建输入材料文件
    const materialLines: string[] = [];
    materialLines.push(`# 账单分析请求`);
    materialLines.push('');
    materialLines.push(`请求: ${opts.requestText}`);
    if (opts.petName) materialLines.push(`宠物: ${opts.petName}`);
    if (opts.hospitalName) materialLines.push(`医院: ${opts.hospitalName}`);
    if (opts.visitDate) materialLines.push(`日期: ${opts.visitDate}`);
    materialLines.push('');

    if (opts.billItems && opts.billItems.length > 0) {
      materialLines.push('## 费用项目');
      materialLines.push('');
      materialLines.push('| 项目 | 金额 |');
      materialLines.push('|------|------|');
      for (const item of opts.billItems) {
        materialLines.push(`| ${item.name} | ¥${item.amount.toFixed(2)} |`);
      }
    }

    if (opts.analysisText) {
      materialLines.push('');
      materialLines.push('## 分析结果');
      materialLines.push('');
      materialLines.push(opts.analysisText);
    }

    const inputFile = path.join(inputDir, 'bill_data.md');
    fs.writeFileSync(inputFile, materialLines.join('\n'), 'utf-8');

    // 构建命令行参数
    const args = [
      pipelineScript,
      '--input', inputDir,
      '--output', outputDir,
      '--vault', vaultDir,
      '--request', opts.requestText,
      '--pet-name', opts.petName || '待确认',
      '--report-type', opts.reportType || 'auto',
      '--pdf-policy', opts.pdfPolicy || 'attempt',
    ];

    // 构建环境变量（包含 xelatex 路径）
    const env = { ...process.env };
    if (XELATEX_PATH && !env.PATH?.includes(XELATEX_PATH)) {
      env.PATH = `${XELATEX_PATH}${path.delimiter}${env.PATH || ''}`;
    }

    console.log(`[PythonBridge] 执行管线: ${PYTHON} ${args.join(' ')}`);

    const { stdout, stderr } = await execFileAsync(PYTHON, args, {
      env,
      timeout: 300_000, // 5 分钟超时（首次 LaTeX 编译需下载宏包）
      maxBuffer: 1024 * 1024, // 1MB
    });

    const buildLog = stdout + '\n' + (stderr || '');

    // 检查输出文件
    const pdfPath = path.join(outputDir, 'report.pdf');
    const mdPath = path.join(outputDir, 'report.md');
    const texPath = path.join(outputDir, 'report.tex');

    const pdfExists = fs.existsSync(pdfPath);
    const mdExists = fs.existsSync(mdPath);

    console.log(`[PythonBridge] 管线完成, PDF=${pdfExists}, MD=${mdExists}`);

    return {
      success: mdExists,
      reportId,
      outputDir,
      pdfPath: pdfExists ? pdfPath : undefined,
      markdownPath: mdExists ? mdPath : undefined,
      texPath: fs.existsSync(texPath) ? texPath : undefined,
      buildLog,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('[PythonBridge] 管线执行失败:', errorMsg);
    return {
      success: false,
      reportId,
      outputDir,
      buildLog: errorMsg,
      error: `Python 管线执行失败: ${errorMsg}`,
    };
  }
}

/** 检查 Python 管线是否可用 */
export function isPipelineAvailable(): boolean {
  return fs.existsSync(path.join(SKILL_DIR, 'scripts', 'run_pipeline.py'));
}

/** 检查 LaTeX 引擎是否可用 */
export function isLatexAvailable(): boolean {
  try {
    const xelatex = path.join(XELATEX_PATH, 'xelatex.exe');
    return fs.existsSync(xelatex);
  } catch {
    return false;
  }
}
