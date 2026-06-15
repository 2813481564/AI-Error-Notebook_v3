import express from "express";
import dotenv from "dotenv";
import router from "./routes";
import { initTaskQueue } from "./controllers/taskController";

dotenv.config();

// 初始化异步后台任务队列
initTaskQueue();

const app = express();

// 提升上传大图的限制
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// 挂载所有以 /api 开头的路由
app.use("/api", router);
app.use("/notebook/api", router);

export default app;
