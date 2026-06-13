//main.jsx es el punto de entrada de la aplicación React.
//  Renderiza el componente principal App 
// dentro del elemento raíz del DOM.

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
