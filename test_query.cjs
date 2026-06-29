const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.join(__dirname, 'questions.db');
const db = new Database(dbPath);

const userId = '2813481564@qq.com';
const notebookId = 'nb_auto_var_mjo9ura'; // From previous log

const dataQuery = `
  SELECT q.*, n.name as notebookName 
  FROM questions q
  LEFT JOIN notebooks n ON q.notebookId = n.id
  WHERE (q.userId = ? OR q.studentId = ?)
  AND q.notebookId = ?
  AND n.type = 'variation'
`;

const params = [userId, userId, notebookId];
const rows = db.prepare(dataQuery).all(...params);
console.log(`Found ${rows.length} rows.`);

if (rows.length > 0) {
  console.log(rows[0]);
}

db.close();
