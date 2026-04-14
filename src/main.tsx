import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // console.log('Registering Service Worker...');
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // console.log('Service Worker registered successfully with scope:', registration.scope);
    }).catch((error) => {
      // console.error('Service Worker registration failed:', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
