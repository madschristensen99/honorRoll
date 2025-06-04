import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { TomoContextProvider } from '@tomo-inc/tomo-web-sdk';
import '@tomo-inc/tomo-web-sdk/style.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <TomoContextProvider
      theme="light"
      chainTypes={['evm']}
      clientId="NSLKg2CPkZSedeIO1u0bibYAb2siIMg4ynNmACAXyCC9o02PKVe0P4Tauc97EHkUc0oF8fMna4nglzipcNCWSOzl"
    >
      <App />
    </TomoContextProvider>
  </React.StrictMode>
);
