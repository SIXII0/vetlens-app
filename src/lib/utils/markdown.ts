/**
 * Markdown → HTML 转换器（浏览器端）
 *
 * 将生成的报告 Markdown 转为带 Tailwind 排版的 HTML，
 * 用于分析结果页和报告详情页的内联渲染。
 */

/**
 * 将 Markdown 字符串转为 HTML，应用阅读友好的排版样式。
 */
export function markdownToHtml(md: string): string {
  // 先包裹在容器中以便统一排版控制
  let html = md
    // 转义 HTML 防止 XSS
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

    // === 标题（字号递进 + 合理间距 + 颜色层次） ===
    // H1: 报告主标题
    .replace(
      /^# (.+)$/gm,
      '<h1 class="text-2xl font-bold text-gray-900 mt-6 mb-5 pb-3 border-b-2 border-gray-200 tracking-tight">$1</h1>'
    )
    // H2: 章节标题
    .replace(
      /^## (.+)$/gm,
      '<h2 class="text-lg font-semibold text-gray-800 mt-7 mb-3 pb-2 border-b border-gray-150">$1</h2>'
    )
    // H3: 小节标题
    .replace(
      /^### (.+)$/gm,
      '<h3 class="text-base font-semibold text-gray-800 mt-5 mb-2">$1</h3>'
    )
    // H4: 项目名（如"1. 血常规 — ¥80.00"）
    .replace(
      /^#### (.+)$/gm,
      '<h4 class="text-[15px] font-semibold text-gray-800 mt-4 mb-1">$1</h4>'
    )

    // === 内联格式 ===
    // 粗体
    .replace(
      /\*\*(.+?)\*\*/g,
      '<strong class="font-semibold text-gray-900">$1</strong>'
    )

    // === 表格 ===
    // 将连续的表格行（|...|）归组为 <table>
    .replace(/((?:\|.+\|\n?)+)/g, (tableBlock) => {
      const rows = tableBlock.trim().split('\n');
      let result = '<div class="overflow-x-auto my-4"><table class="w-full text-sm border-collapse">';

      let isFirstDataRow = true;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i].trim();
        if (!row.startsWith('|')) continue;

        // 分隔行（|---|---|）
        if (row.match(/^\|[\s\-:|]+\|$/)) {
          isFirstDataRow = false;
          continue;
        }

        const cells = row
          .split('|')
          .filter(c => c.trim().length > 0)
          .map(c => c.trim());

        // 第一行（分隔行之前）为表头
        const isHeader = isFirstDataRow && (i === 0 || rows[i - 1]?.match(/^\|[\s\-:|]+\|$/));
        const tag = isHeader ? 'th' : 'td';
        const cellClass = isHeader
          ? 'px-3 py-2.5 text-xs font-semibold text-gray-600 uppercase tracking-wider bg-gray-50 border-b-2 border-gray-200 text-left'
          : 'px-3 py-2 text-sm text-gray-700 border-b border-gray-100';

        result += `<tr class="${isHeader ? '' : 'hover:bg-gray-50/50 transition-colors'}">`;
        for (const cell of cells) {
          result += `<${tag} class="${cellClass}">${cell}</${tag}>`;
        }
        result += '</tr>';

        if (isHeader) isFirstDataRow = false;
      }

      result += '</table></div>';
      return result;
    })

    // === 引用块（缩进段落，去掉列表符号） ===
    .replace(
      /^> (.+)$/gm,
      '<blockquote class="border-l-[3px] border-gray-300 pl-4 pr-2 py-1.5 my-1.5 text-[14px] text-gray-600 leading-relaxed ml-1">$1</blockquote>'
    )
    // 合并连续的 blockquote
    .replace(/<\/blockquote>\n<blockquote class="[^"]*">/g, '\n')

    // === 无序列表 ===
    .replace(
      /^- (.+)$/gm,
      '<li class="ml-5 pl-1 text-[15px] text-gray-700 leading-relaxed mb-1 list-disc">$1</li>'
    )

    // === 有序列表 ===
    .replace(
      /^\d+\. (.+)$/gm,
      '<li class="ml-5 pl-1 text-[15px] text-gray-700 leading-relaxed mb-1 list-decimal">$1</li>'
    )

    // === 水平分隔线 ===
    .replace(
      /^---$/gm,
      '<hr class="my-6 border-gray-200">'
    )

    // === 代码块 ===
    .replace(
      /```([\s\S]*?)```/g,
      '<pre class="bg-gray-100 border border-gray-200 p-4 rounded-lg text-[13px] leading-relaxed overflow-x-auto my-3 font-mono text-gray-700">$1</pre>'
    )

    // === 段落（双换行 → 新段落） ===
    // 用容器包裹避免 <p> 内嵌套块级元素
    .replace(/\n\n/g, '</p><p class="text-[15px] text-gray-700 leading-relaxed my-2">')

    // === 单换行（段落内换行） ===
    .replace(/\n/g, '<br>');

  // 最外层包裹
  return `<div class="markdown-report space-y-1"><p class="text-[15px] text-gray-700 leading-relaxed my-2">${html}</p></div>`;
}
