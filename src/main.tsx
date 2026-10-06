import React from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig, motion } from 'motion/react';
import App from './App';
import './style.css';
import './mobile.css';
import './layout.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <motion.div
        className="app-motion"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
      >
        <App />
      </motion.div>
    </MotionConfig>
  </React.StrictMode>,
);
