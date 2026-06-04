require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const https = require('https');
const { HttpsProxyAgent } = require('https-proxy-agent');

function proxyFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const agent = new HttpsProxyAgent('http://127.0.0.1:7897');
    const headers = {};
    if (options.headers) {
      if (typeof options.headers.forEach === 'function') {
        options.headers.forEach((value, key) => {
          headers[key] = value;
        });
      } else {
        Object.assign(headers, options.headers);
      }
    }
    const reqOptions = {
      method: options.method || 'GET',
      headers: headers,
      agent: agent,
      timeout: 120000 
    };
    const req = https.request(url, reqOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: new Headers(res.headers),
          text: () => Promise.resolve(body.toString('utf-8')),
          json: () => Promise.resolve(JSON.parse(body.toString('utf-8'))),
          arrayBuffer: () => Promise.resolve(body.buffer),
        });
      });
    });
    
    req.on('timeout', () => {
      req.destroy(new Error('Request timed out after 120s'));
    });
    
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

globalThis.fetch = proxyFetch;

const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    timeout: 120000
  }
});

const db = new Database(path.join(process.cwd(), "questions.db"));
let imageBase64 = null;

try {
  const row = db.prepare("SELECT imageUrl FROM questions WHERE imageUrl LIKE 'data:image%' LIMIT 1").get();
  if (row) {
    imageBase64 = row.imageUrl;
    console.log("Loaded real image from DB, length:", imageBase64.length);
  }
} catch (err) {
  console.log("Could not read image from DB, using mock image:", err.message);
}

if (!imageBase64) {
  imageBase64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
}

const prompt = `
你是一个AI智能名师。请根据提供的错题或试卷图片：
1. 提取题目的文字内容 (如果手写，请高精度精准识别)。
2. 判断所属学科（如数学、物理、化学、英语、语文等）。
3. 提供详细的解题步骤（必须清晰易懂，可以直接指导学生）。
4. 梳理涉及的关键核心知识点（如‘二次函数’，最多三个，如果是多道题可综合最具代表性的主考点）。
5. 自动检测图片中是否包含学生手写或打印的解答步骤/答案（作答痕迹）。
   - 如果没有发现学生作答痕迹，则 "hasStudentAnswer" 设为 false，"studentAnswer" 设为空字符串，"errorDiagnosis" 设为空数组。
   - 如果发现学生作答痕迹，则：
     * 将 "hasStudentAnswer" 设为 true。
     * 将学生手写的完整原始解答文本提取出来，存入 "studentAnswer"（保持原本字句）。
     * 将学生的解答过程数字化，拆分为清晰的【逐行推导步骤列表】，填充在 "errorDiagnosis" 数组中。每一步都需要包含：
       - "stepNumber": 步骤序号 (1, 2, 3...)。
       - "stepContent": 数字化后的该步骤数学公式或文字内容。
       - "status": 该步骤的状态 (correct / incorrect / consequential_error)。
       - "comment": 仅在 status 为 "incorrect" 或 "consequential_error" 时填写说明。

请返回符合以下结构的严格JSON格式，不要包含任何 Markdown 包裹标记：
{
  "originalText": "提取的题目完整文字内容",
  "subject": "学科名称",
  "knowledgePoints": ["考点1", "考点2"],
  "solution": "解题步骤",
  "hasStudentAnswer": true,
  "studentAnswer": "学生解答的原始完整文本",
  "errorDiagnosis": [
    {
      "stepNumber": 1,
      "stepContent": "步骤1",
      "status": "correct",
      "comment": ""
    }
  ]
}
`;

console.log("Sending request without responseMimeType...");
ai.models.generateContent({
  model: 'gemma-4-31b-it',
  contents: [
    {
      role: 'user',
      parts: [
        {
          inlineData: {
            data: imageBase64.split(',')[1] || imageBase64,
            mimeType: 'image/jpeg'
          }
        },
        { text: prompt }
      ]
    }
  ],
  config: {
    // 移除 responseMimeType 限制，仅保留 temperature
    temperature: 0.2
  }
}).then(res => {
  console.log("Success! Response length:", res.text.length);
  console.log("Response text:", res.text);
}).catch(err => {
  console.error("Failed:", err);
});
