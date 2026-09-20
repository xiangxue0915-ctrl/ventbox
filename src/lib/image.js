// 头像上传工具：把用户选的图片压缩成小尺寸 dataURL，存 localStorage 也不怕爆
// 统一压到 size×size 的 jpeg（0.82 质量），约 3~8KB

export function readImageAsAvatar(file, size = 96) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      reject(new Error('请选择图片文件'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片解析失败'));
      img.onload = () => {
        try {
          const cv = document.createElement('canvas');
          cv.width = size; cv.height = size;
          const ctx = cv.getContext('2d');
          // 居中裁剪成正方形，避免拉伸变形
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          resolve(cv.toDataURL('image/jpeg', 0.82));
        } catch (e) {
          reject(new Error('处理失败'));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
