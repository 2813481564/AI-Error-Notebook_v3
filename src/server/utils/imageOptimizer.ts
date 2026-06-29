import sharp from 'sharp';

/**
 * 为大模型 OCR 提取优化的物理外挂（图像增强）
 * 1. 灰度化 (Grayscale)：消除彩色噪点
 * 2. 直方图均衡/对比度拉伸 (Normalize)：增强笔迹与纸张的对比度
 * 3. 锐化 (Sharpen)：使得数字和小数点更加锐利清晰
 *
 * @param base64Data 带前缀或不带前缀的图片 base64 字符串
 * @param mimeType 图片类型，默认为 image/jpeg
 * @returns 优化后的不带前缀的 base64 字符串
 */
export async function enhanceImageForOcr(base64Data: string): Promise<string> {
  try {
    // 提取纯 base64 数据
    let pureBase64 = base64Data;
    if (base64Data.includes(',')) {
      pureBase64 = base64Data.split(',')[1];
    }

    const imageBuffer = Buffer.from(pureBase64, 'base64');

    const optimizedBuffer = await sharp(imageBuffer)
      // .grayscale() // 移除灰度化，保留色彩，让多模态大模型能通过颜色（如红色）过滤老师的批改痕迹
      .normalize() // 1. 增强对比度
      .sharpen({
        sigma: 0.5, // 显著降低锐化半径（原1.5），防止细线笔画（如 '4', '0.6'）断裂或扭曲
        m1: 0.5,    
        m2: 1       
      })           // 2. 轻度锐化，仅做基础清晰化
      .jpeg({ quality: 85 }) // 压缩优化，避免 Base64 体积过大
      .toBuffer();

    return optimizedBuffer.toString('base64');
  } catch (error) {
    console.error("[ImageOptimizer] 图像物理增强失败，将返回原图:", error);
    // 如果处理失败，为了容错，直接返回原始数据
    if (base64Data.includes(',')) {
      return base64Data.split(',')[1];
    }
    return base64Data;
  }
}
