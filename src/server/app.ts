import express from "express";
import dotenv from "dotenv";
import router from "./routes";

dotenv.config();

const app = express();

// 提升上传大图的限制
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// 挂载所有以 /api 开头的路由
app.use("/api", router);

export default app;
