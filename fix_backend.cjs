const fs = require('fs');
let c = fs.readFileSync('src/server/controllers/aiController.ts', 'utf8');

// 1. Add boundingBox to prompts
c = c.replace(/- subject: \[学科名称，如数学\/物理\/化学等\]/g, '- subject: [学科名称，如数学/物理/化学等]\n- boundingBox: [题目所在区域的矩形框坐标，格式为 {"x": 10, "y": 20, "w": 400, "h": 200}]');

// 2. Add boundingBox to extractResult
c = c.replace(/subject: item\.subject \|\| "数学",\s*originalText: item\.originalText \|\| "",\s*studentAnswer: item\.studentAnswer \|\| "",\s*standardAnswer: item\.standardAnswer \|\| "",\s*visualContext: item\.visualContext \|\| ""/g, 
  'subject: item.subject || "数学",\n           originalText: item.originalText || "",\n           studentAnswer: item.studentAnswer || "",\n           standardAnswer: item.standardAnswer || "",\n           visualContext: item.visualContext || "",\n           boundingBox: item.boundingBox || { x: 0, y: 0, w: 0, h: 0 }');

c = c.replace(/subject: "数学", originalText: extractResponse\.text, studentAnswer: "", standardAnswer: "", visualContext: ""/g,
  'subject: "数学", originalText: extractResponse.text, studentAnswer: "", standardAnswer: "", visualContext: "", boundingBox: {x:0, y:0, w:0, h:0}');

fs.writeFileSync('src/server/controllers/aiController.ts', c);
console.log('Done 1 and 2');
