import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  // base: './' 让打包后的资源用相对路径引用，适配 GitHub Pages 子路径
  // https://xiangxue0915-ctrl.github.io/ventbox/
  base: './',
  plugins: [react()],
});
