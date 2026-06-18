import fs from "fs";
import path from "path";
import crypto from "crypto";

// 上传目录：服务根目录下的 uploads 文件夹
const UPLOADS_DIR = path.join(process.cwd(), "uploads");

// 确保目录存在，不存在则自动创建
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  console.log("[FileService] 已自动创建 uploads 目录:", UPLOADS_DIR);
}

/**
 * 检测一个字符串是否为 Base64 编码的图片 Data URL
 */
export const isBase64Image = (str: string): boolean => {
  return typeof str === "string" && str.startsWith("data:image/");
};

/**
 * 将 Base64 图片 Data URL 保存到本地磁盘，返回可访问的相对 URL 路径
 * @param base64Str - 格式为 "data:image/png;base64,xxxx..." 的图片字符串
 * @returns 相对路径，如 "/uploads/img_xxxxxx.png"
 */
export const saveBase64Image = (base64Str: string): string => {
  // 解析 MIME 类型，例如 "data:image/png;base64,..." -> "png"
  const mimeMatch = base64Str.match(/^data:image\/(\w+);base64,/);
  if (!mimeMatch) {
    throw new Error("[FileService] 无效的 Base64 图片格式");
  }
  const ext = mimeMatch[1] === "jpeg" ? "jpg" : mimeMatch[1];

  // 提取纯 base64 数据部分
  const base64Data = base64Str.split(",")[1];
  if (!base64Data) {
    throw new Error("[FileService] Base64 数据内容为空");
  }

  // 生成唯一文件名：时间戳 + 随机 UUID 短码
  const uniqueId = crypto.randomBytes(8).toString("hex");
  const fileName = `img_${Date.now()}_${uniqueId}.${ext}`;
  const filePath = path.join(UPLOADS_DIR, fileName);

  // 解码为二进制 Buffer 并写入磁盘
  const buffer = Buffer.from(base64Data, "base64");
  fs.writeFileSync(filePath, buffer);

  console.log(`[FileService] 图片已物理落盘: ${fileName} (${(buffer.byteLength / 1024).toFixed(1)} KB)`);

  // 返回可直接用于 <img src="..."> 的相对 URL (增加 /notebook 前缀配合 Nginx 路由)
  return `/notebook/uploads/${fileName}`;
};

/**
 * 删除磁盘上的一个图片文件（通过其相对路径 URL）
 * 如果图片是 Base64 内嵌格式则直接忽略，如果文件不存在则静默跳过
 * @param imageUrl - 相对路径，如 "/uploads/img_xxx.png"
 */
export const deleteImageFile = (imageUrl: string): void => {
  if (!imageUrl || isBase64Image(imageUrl)) return;
  if (!imageUrl.startsWith("/uploads/")) return;

  const fileName = path.basename(imageUrl);
  const filePath = path.join(UPLOADS_DIR, fileName);

  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`[FileService] 已删除关联图片文件: ${fileName}`);
    } catch (err) {
      console.warn(`[FileService] 删除图片文件失败: ${fileName}`, err);
    }
  }
};
