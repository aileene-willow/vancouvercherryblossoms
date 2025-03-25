import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import CherryBlossoms from './components/CherryBlossoms';
import './components/CherryBlossoms.css';

function App() {
  const basePath = process.env.REACT_APP_BASE_PATH || '';

  return (
    <Router basename={basePath}>
      <div className="App">
        <header className="App-header">
          <h1>Let's plan your cherry blossom tour!</h1>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<CherryBlossoms />} />
            <Route path="/vancouvercherryblossoms" element={<Navigate to="/" replace />} />
            <Route path="/vancouvercherryblossoms/*" element={<CherryBlossoms />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
