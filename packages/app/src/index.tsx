import '@backstage/cli/asset-types';

import ReactDOM from 'react-dom/client';

import App from './App';
import '@backstage/ui/css/styles.css';

const root = document.getElementById('root');

if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
