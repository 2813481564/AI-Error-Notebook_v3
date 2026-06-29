const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'error_notebook.db');
const db = new Database(dbPath);

console.log("Checking variation questions...");
const varQuestions = db.prepare(`
  SELECT id, knowledgePoints, examDirection, notebookId, userId 
  FROM questions 
  WHERE knowledgePoints LIKE '%AI变式题%' OR examDirection LIKE '%变式强化题%'
`).all();
console.log(`Found ${varQuestions.length} AI variation questions.`);

console.log("Checking normal unclassified questions...");
const normalQuestions = db.prepare(`
  SELECT id, userId 
  FROM questions 
  WHERE (notebookId IS NULL OR notebookId = '')
  AND (knowledgePoints NOT LIKE '%AI变式题%' AND (examDirection IS NULL OR examDirection NOT LIKE '%变式强化题%'))
`).all();
console.log(`Found ${normalQuestions.length} normal unclassified questions.`);

db.close();
