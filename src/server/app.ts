import express from "express";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import router from "./routes";
import { initTaskQueue } from "./controllers/taskController";

dotenv.config();

// 初始化异步后台任务队列
initTaskQueue();

const app = express();

// 提升上传大图的限制
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// 托管 uploads 静态资源目录（存放错题原图等图片文件）
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));
app.use("/notebook/uploads", express.static(uploadsDir));

// 挂载所有以 /api 开头的路由
app.use("/api", router);
app.use("/notebook/api", router);

export default app;
