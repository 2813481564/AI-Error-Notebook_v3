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
      .grayscale() // 1. 灰度化
      .normalize() // 2. 增强对比度
      .sharpen({
        sigma: 1.5, // 锐化半径
        m1: 1,      // 平坦区域的斜率
        m2: 2       // 边缘区域的斜率
      })           // 3. 锐化，极大地突出铅笔字和小数点
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
