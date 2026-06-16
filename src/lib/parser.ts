export function parseIndividualQuestions(text: string): { id: string; number: string; content: string }[] {
  if (!text) return [];
  const regex = /(?:^|\n)\s*([0-9一二三四五六七八九十]+[.\u3001、\uFF0E\-\s_]|第[0-9一二三四五六七八九十]+[题问小题步]|\([0-9一二三四五六七八九十]+\)|（[0-9一二三四五六七八九十]+）)/g;
  
  const matches: { index: number; text: string }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ index: match.index, text: match[1].trim() });
  }
  
  if (matches.length === 0) {
    return [{ id: '1', number: '整道题', content: text.trim() }];
  }
  
  const result: { id: string; number: string; content: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + (text[matches[i].index] === '\n' ? 1 : 0);
    const end = i + 1 < matches.length ? matches[i+1].index : text.length;
    const fullContent = text.substring(start, end).trim();
    
    const prefix = matches[i].text;
    result.push({
      id: String(i + 1),
      number: prefix,
      content: fullContent
    });
  }
  return result;
}

export function parseIndividualSolutions(text: string): { number: string; content: string }[] {
  if (!text) return [];
  const regex = /(?:^|\n)\s*(###\s*第?[0-9一二三四五六七八九十]+[题问小题步]解析|第?[0-9一二三四五六七八九十]+[.\u3001、\uFF0E\-\s_]解析?|【解析[0-9一二三四五六七八九十]+】)/g;
  
  const matches: { index: number; text: string }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ index: match.index, text: match[1].trim() });
  }
  
  if (matches.length === 0) {
    return [{ number: '完整解析', content: text.trim() }];
  }
  
  const result: { number: string; content: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + (text[matches[i].index] === '\n' ? 1 : 0);
    const end = i + 1 < matches.length ? matches[i+1].index : text.length;
    const fullContent = text.substring(start, end).trim();
    result.push({
      number: matches[i].text,
      content: fullContent
    });
  }
  return result;
}

export function parseIndividualStudentAnswers(text: string): { number: string; content: string }[] {
  if (!text) return [];
  const regex = /(?:^|\n)\s*(###\s*第?[0-9一二三四五六七八九十]+[题问小题步]学生作答)/g;
  
  const matches: { index: number; text: string }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ index: match.index, text: match[1].trim() });
  }
  
  if (matches.length === 0) {
    return [{ number: '学生作答', content: text.trim() }];
  }
  
  const result: { number: string; content: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + (text[matches[i].index] === '\n' ? 1 : 0);
    const end = i + 1 < matches.length ? matches[i+1].index : text.length;
    const fullContent = text.substring(start, end).replace(matches[i].text, '').trim();
    result.push({
      number: matches[i].text,
      content: fullContent
    });
  }
  return result;
}

export function parseIndividualStandardAnswers(text: string): { number: string; content: string }[] {
  if (!text) return [];
  const regex = /(?:^|\n)\s*(###\s*第?[0-9一二三四五六七八九十]+[题问小题步]标准答案)/g;
  
  const matches: { index: number; text: string }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ index: match.index, text: match[1].trim() });
  }
  
  if (matches.length === 0) {
    return [{ number: '标准答案', content: text.trim() }];
  }
  
  const result: { number: string; content: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + (text[matches[i].index] === '\n' ? 1 : 0);
    const end = i + 1 < matches.length ? matches[i+1].index : text.length;
    const fullContent = text.substring(start, end).replace(matches[i].text, '').trim();
    result.push({
      number: matches[i].text,
      content: fullContent
    });
  }
  return result;
}

export function parseIndividualErrorAnalysis(text: string): { number: string; content: string }[] {
  if (!text) return [];
  const regex = /(?:^|\n)\s*(###\s*第?[0-9一二三四五六七八九十]+[题问小题步]错因分析|第?[0-9一二三四五六七八九十]+[.\u3001、\uFF0E\-\s_]错因分析)/g;
  
  const matches: { index: number; text: string }[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push({ index: match.index, text: match[1].trim() });
  }
  
  if (matches.length === 0) {
    return [{ number: '错因分析', content: text.trim() }];
  }
  
  const result: { number: string; content: string }[] = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index + (text[matches[i].index] === '\n' ? 1 : 0);
    const end = i + 1 < matches.length ? matches[i+1].index : text.length;
    const fullContent = text.substring(start, end).trim();
    result.push({
      number: matches[i].text,
      content: fullContent
    });
  }
  return result;
}
