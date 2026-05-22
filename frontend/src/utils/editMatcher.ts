/**
 * 搜索匹配函数（前端复现后端 matching 逻辑）
 *
 * 用于在前端预览 AI 建议的 edit 操作结果。
 * 策略与后端 edit.py 的 _find_matching 一致。
 */

/**
 * 在 content 中查找与 search 匹配的文本
 *
 * 策略：
 * 1. 精确匹配
 * 2. 逐行去空白匹配
 * 3. 首尾锚点匹配（至少 3 行时）
 *
 * @returns 匹配到的文本（用于替换），或 null（未找到）
 */
export function findMatchingString(content: string, search: string): string | null {
  if (!search) return null;

  // 策略 1: 精确匹配
  if (content.includes(search)) return search;

  // 策略 2: 逐行去空白
  const contentLines = content.split('\n');
  const searchLines = search.split('\n').filter(l => l !== '');

  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    let match = true;
    for (let j = 0; j < searchLines.length; j++) {
      const cl = contentLines[i + j];
      const sl = searchLines[j];
      if (!cl || !sl || cl.trim() !== sl.trim()) {
        match = false;
        break;
      }
    }
    if (match) {
      return contentLines.slice(i, i + searchLines.length).join('\n');
    }
  }

  // 策略 3: 首尾锚点（至少 3 行）
  if (searchLines.length >= 3) {
    const first = (searchLines[0] ?? '').trim();
    const last = (searchLines[searchLines.length - 1] ?? '').trim();
    for (let i = 0; i < contentLines.length; i++) {
      if ((contentLines[i] ?? '').trim() !== first) continue;
      for (let j = i + 2; j < contentLines.length; j++) {
        if ((contentLines[j] ?? '').trim() === last) {
          return contentLines.slice(i, j + 1).join('\n');
        }
      }
    }
  }

  return null;
}

/**
 * 根据 edit 参数计算修改后的内容
 *
 * @param content 原文件内容
 * @param oldString 要替换的文本
 * @param newString 替换后的文本
 * @param replaceAll 是否替换所有匹配
 * @returns 修改后的内容 + 匹配是否成功
 */
export function computeEditResult(
  content: string,
  oldString: string,
  newString: string,
  replaceAll: boolean = false,
): { success: boolean; result: string; error?: string } {
  if (oldString === '' && newString === '') {
    return { success: false, result: content, error: 'oldString 和 newString 不能同时为空' };
  }

  // 追加模式（oldString 为空）
  if (oldString === '') {
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const result = normalized.endsWith('\n')
      ? normalized + newString + '\n'
      : normalized + '\n' + newString + '\n';
    return { success: true, result };
  }

  // 删除模式（newString 为空）
  if (newString === '') {
    const found = findMatchingString(content, oldString);
    if (!found) {
      return { success: false, result: content, error: '未找到匹配的 oldString' };
    }

    const occurrences = content.split(found).length - 1;
    if (occurrences > 1 && !replaceAll) {
      return {
        success: false,
        result: content,
        error: `找到多个匹配项（${occurrences} 个），请提供更多上下文或使用 replaceAll`,
      };
    }

    const result = replaceAll ? content.split(found).join('') : content.replace(found, '');
    return { success: true, result };
  }

  // 正常替换模式
  const found = findMatchingString(content, oldString);
  if (!found) {
    return { success: false, result: content, error: '未找到匹配的 oldString' };
  }

  const occurrences = content.split(found).length - 1;
  if (occurrences > 1 && !replaceAll) {
    return {
      success: false,
      result: content,
      error: `找到多个匹配项（${occurrences} 个），请提供更多上下文或使用 replaceAll`,
    };
  }

  const result = replaceAll ? content.split(found).join(newString) : content.replace(found, newString);
  return { success: true, result };
}
