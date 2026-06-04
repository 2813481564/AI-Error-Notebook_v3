require('dotenv').config();
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
    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

globalThis.fetch = proxyFetch;

const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

console.log("Sending Gemini test request with gemma-4-31b-it...");
ai.models.generateContent({ 
  model: 'gemma-4-31b-it', 
  contents: '请用中文回答：你好！请问你是谁？' 
}).then(res => {
  console.log("Success! Response from Gemini:", res.text);
}).catch(err => {
  console.error("Failed:", err);
});
