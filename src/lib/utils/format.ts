/** 格式化金额 */
export function formatCurrency(amount: number): string {
  return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 格式化日期 */
export function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    return dateStr;
  }
}

/** 获取相对时间 */
export function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;

  return formatDate(dateStr);
}

/** 获取价格对应的颜色 class */
export function priceLevelClass(level: string): string {
  switch (level) {
    case '合理': return 'text-emerald-600';
    case '略高': return 'text-amber-600';
    case '偏高': return 'text-red-600';
    default: return 'text-warm-500';
  }
}

/** 获取价格对应的 badge class */
export function priceLevelBadge(level: string): string {
  switch (level) {
    case '合理': return 'badge-green';
    case '略高': return 'badge-amber';
    case '偏高': return 'badge-red';
    default: return 'badge-gray';
  }
}

/** 获取必要性对应的颜色 */
export function necessityClass(necessity: string): string {
  if (necessity.includes('必做')) return 'text-red-600';
  if (necessity.includes('建议做')) return 'text-amber-600';
  return 'text-emerald-600';
}

/** 截断文本 */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...';
}
