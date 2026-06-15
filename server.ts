import app from "./src/server/app";
import path from "path";
import express from "express";
import { createServer as createViteServer } from "vite";

const PORT = parseInt(process.env.PORT || "9088");

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    // 托管静态文件到 /notebook 路径下
    app.use('/notebook', express.static(distPath));
    
    // 兼容不带斜杠的 /notebook 请求重定向到 /notebook/
    app.get('/notebook', (req, res) => {
      res.redirect('/notebook/');
    });

    // 所有 /notebook/* 请求返回 index.html 供单页应用路由接管
    app.get('/notebook/*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
