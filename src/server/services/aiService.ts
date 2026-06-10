import { GoogleGenAI } from "@google/genai";
import https from "https";
import { getSetting } from "./settingService";

// 助手函数：从 LLM 原始文本中提取 JSON 字符串
export function extractJsonString(str: string): string {
  const firstArray = str.indexOf('[');
  const firstObject = str.indexOf('{');

  let startIdx = -1;
  let endIdx = -1;

  if (firstArray !== -1 && (firstObject === -1 || firstArray < firstObject)) {
    startIdx = firstArray;
    endIdx = str.lastIndexOf(']');
  } else if (firstObject !== -1) {
    startIdx = firstObject;
    endIdx = str.lastIndexOf('}');
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    return str.substring(startIdx, endIdx + 1);
  }

  return str;
}

// 助手函数：转义 JSON 字符串值内部的 LaTeX 反斜杠，防止 JSON.parse 崩溃
export function sanitizeJsonString(rawStr: string): string {
  let result = '';
  let inString = false;
  let i = 0;
  
  while (i < rawStr.length) {
    const char = rawStr[i];
    
    if (!inString) {
      result += char;
      if (char === '"') {
        inString = true;
      }
      i++;
    } else {
      if (char === '"') {
        result += char;
        inString = false;
        i++;
      } else if (char === '\\') {
        let backslashCount = 0;
        while (i < rawStr.length && rawStr[i] === '\\') {
          backslashCount++;
          i++;
        }
        
        const nextChar = rawStr[i] || '';
        
        let isLatexN = false;
        if (nextChar === 'n') {
          const nextNextChar = rawStr[i + 1] || '';
          if (/[a-zA-Z]/.test(nextNextChar)) {
            isLatexN = true;
          }
        }
        
        if (nextChar === '"') {
          const literalCount = backslashCount - 1;
          result += '\\'.repeat(literalCount * 2) + '\\"';
          i++;
        } else if (nextChar === 'n' && !isLatexN) {
          const literalCount = backslashCount - 1;
          result += '\\'.repeat(literalCount * 2) + '\\n';
          i++;
        } else {
          result += '\\'.repeat(backslashCount * 2);
        }
      } else {
        result += char;
        i++;
      }
    }
  }
  return result;
}

// 核心：大模型请求调用（支持 OpenAI 兼容 API 和 Gemini 本地降级回退）
export async function generateContentWithFallback(params: {
  contents: any[];
  config?: any;
  model?: string;
  systemPrompt?: string;
  thinkingMode?: 'enabled' | 'disabled';
}) {
  const provider = getSetting("AI_PROVIDER", process.env.AI_PROVIDER || 'gemini');
  const apiBaseUrl = getSetting("AI_API_BASE_URL", process.env.AI_API_BASE_URL || '');
  const apiKey = getSetting("AI_API_KEY", process.env.AI_API_KEY || '');
  const openaiModel = getSetting("AI_MODEL", process.env.AI_MODEL || 'glm-5.1');
  const geminiModel = getSetting("GEMINI_MODEL", process.env.GEMINI_MODEL || 'gemma-4-31b-it');

  if (provider === 'openai') {
    const modelToUse = params.model || openaiModel;
    console.log(`[AI Request via OpenAI Compat] Using model: ${modelToUse}, thinkingMode: ${params.thinkingMode || 'disabled'}`);

    const userMessages = params.contents.map(c => {
      const openAiContent: any[] = [];
      if (c.parts) {
        for (const part of c.parts) {
          if (part.text) {
            openAiContent.push({ type: 'text', text: part.text });
          } else if (part.inlineData) {
            openAiContent.push({
              type: 'image_url',
              image_url: {
                url: `data:${part.inlineData.mimeType || 'image/jpeg'};base64,${part.inlineData.data}`
              }
            });
          }
        }
      }
      return {
        role: c.role || 'user',
        content: openAiContent.length === 1 && openAiContent[0].type === 'text'
          ? openAiContent[0].text
          : openAiContent
      };
    });

    const messages = params.systemPrompt
      ? [{ role: 'system', content: params.systemPrompt }, ...userMessages]
      : userMessages;

    const urlObj = new URL(`${apiBaseUrl}/chat/completions`);
    const reqData: any = {
      model: modelToUse,
      messages: messages,
      temperature: params.config?.temperature ?? 0.7
    };

    if (modelToUse === 'glm-5.1') {
      reqData.thinking = {
        type: params.thinkingMode || 'disabled'
      };
      reqData.temperature = params.thinkingMode === 'enabled' ? 1.0 : 0.1;
    }

    const reqBody = JSON.stringify(reqData);

    const responseText = await new Promise<string>((resolve, reject) => {
      const reqOptions: import('https').RequestOptions = {
        hostname: urlObj.hostname,
        port: Number(urlObj.port) || 443,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(reqBody)
        },
        timeout: 1200000
      };

      const req = https.request(reqOptions, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('AI 请求超时（1200s），请重试')); });
      req.write(reqBody);
      req.end();
    });

    try {
      const json = JSON.parse(responseText) as any;
      if (!json.choices) {
        throw new Error(json.error?.message || `API 错误: ${responseText.substring(0, 200)}`);
      }
      const text = json.choices?.[0]?.message?.content;
      if (!text) throw new Error("Empty response from AI API");
      return { text };
    } catch (parseError: any) {
      console.error("[AI OpenAI Parse Error]", parseError.message, responseText.substring(0, 300));
      throw parseError;
    }
  }

  // Gemini 默认处理逻辑
  const primaryModel = geminiModel;
  const modelToUse = params.model || primaryModel;
  const geminiApiKey = getSetting("GEMINI_API_KEY", process.env.GEMINI_API_KEY || "");
  const ai = new GoogleGenAI({ apiKey: geminiApiKey });

  try {
    console.log(`[AI Request] Using model: ${modelToUse}`);
    return await ai.models.generateContent({
      ...params,
      model: modelToUse,
    });
  } catch (error: any) {
    const errorStr = (error.message || error.toString() || "").toLowerCase();
    const isRetriableError = errorStr.includes("429") ||
      errorStr.includes("quota") ||
      errorStr.includes("limit") ||
      errorStr.includes("resource_exhausted") ||
      errorStr.includes("rate_limit") ||
      errorStr.includes("socket") ||
      errorStr.includes("fetch failed") ||
      errorStr.includes("503") ||
      errorStr.includes("unavailable") ||
      errorStr.includes("high demand") ||
      (error.status && (error.status === 503 || error.status === 429));

    if (isRetriableError && modelToUse !== 'gemma-4-26b-a4b-it') {
      console.warn(`[AI Warning] Model ${modelToUse} failed, automatically retrying with fallback 'gemma-4-26b-a4b-it'...`);
      try {
        return await ai.models.generateContent({
          ...params,
          model: 'gemma-4-26b-a4b-it',
        });
      } catch (fallbackError: any) {
        console.error("[AI Error] Fallback to gemma-4-26b-a4b-it also failed:", fallbackError);
        throw fallbackError;
      }
    }
    throw error;
  }
}
