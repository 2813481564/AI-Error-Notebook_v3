const fs = require('fs');
const lines = fs.readFileSync('src/components/AddQuestion.tsx', 'utf8').split(/\r?\n/);

const step2Idx = lines.findIndex(l => l.includes('STEP 2'));
const step3Idx = lines.findIndex(l => l.includes('STEP 3'));
const extractIdx = lines.findIndex(l => l.includes('const extractQuestions'));
const diagnoseIdx = lines.findIndex(l => l.includes('const diagnoseAll'));
const saveIdx = lines.findIndex(l => l.includes('const handleSave'));

console.log('STEP 2:', step2Idx);
console.log('STEP 3:', step3Idx);
console.log('extractQuestions:', extractIdx);
console.log('diagnoseAll:', diagnoseIdx);
console.log('handleSave:', saveIdx);
