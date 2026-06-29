/**
 * 计算两个字符串的 Levenshtein 距离
 * @param a 字符串 a
 * @param b 字符串 b
 * @returns 两个字符串之间的编辑距离
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) == a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * 计算两个字符串的相似度 (0 到 1 之间)
 * @param a 字符串 a
 * @param b 字符串 b
 * @returns 相似度比例，完全相同为 1
 */
export function stringSimilarity(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1.0;
  const distance = levenshteinDistance(a, b);
  return (maxLength - distance) / maxLength;
}
