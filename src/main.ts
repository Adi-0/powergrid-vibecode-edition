import './ui/fonts.css';
import { mountTestScene } from './scenes/test-scene';

declare global {
  interface Window {
    __ready?: boolean;
    __probe?: () => number;
  }
}

const params = new URLSearchParams(location.search);
const app = document.getElementById('app')!;
document.body.style.margin = '0';
document.body.style.background = '#EFECE4';

if (params.get('scene') === 'test') {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100vw;height:100vh';
  app.appendChild(canvas);
  const t = mountTestScene(canvas);
  window.__probe = t.probe;
  window.__ready = true;
} else {
  app.textContent = 'Grid Atlas';
  window.__ready = true;
}
