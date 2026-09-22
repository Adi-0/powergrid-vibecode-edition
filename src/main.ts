import './ui/fonts.css';
import './ui/style.css';
import { mountTestScene } from './scenes/test-scene';
import { App } from './app/app';

declare global {
  interface Window {
    __ready?: boolean;
    __probe?: () => number;
    __app?: App;
  }
}

const params = new URLSearchParams(location.search);
const root = document.getElementById('app')!;

if (params.get('scene') === 'test') {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100vw;height:100vh';
  root.appendChild(canvas);
  const t = mountTestScene(canvas);
  window.__probe = t.probe;
  window.__ready = true;
} else {
  const app = new App(root);
  window.__app = app;
  let ready = false;
  app.onReady = () => {
    if (ready) return;
    ready = true;
    document.fonts.ready.then(() => (window.__ready = true));
  };
  app.startSolver();
}
