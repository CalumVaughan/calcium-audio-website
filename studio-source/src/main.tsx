import { createRoot } from 'react-dom/client';
import Studio from './app/studio';
import './app/globals.css';
import './fonts.css';
import { hasSavedStudio, importStudio } from './lib/storage';
async function start() {
  if (import.meta.env.DEV) {
    try {
      if (!hasSavedStudio()) {
        const response = await fetch('/__local_private_plan');
        if (response.ok) await importStudio(await response.text());
      }
    } catch {
      /* Show the workspace even if storage or the optional local plan is unavailable. */
    }
  }
  createRoot(document.getElementById('root')!).render(<Studio />);
}
void start();
