import { createRoot } from 'react-dom/client';
import { App } from './App';

const element = document.getElementById('root');
if (element !== null) createRoot(element).render(<App />);
