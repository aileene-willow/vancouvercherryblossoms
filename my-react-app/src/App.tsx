import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import CherryBlossoms from './components/CherryBlossoms';
import './components/CherryBlossoms.css';

function App() {
  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <h1>Let's plan your cherry blossom tour!</h1>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<CherryBlossoms />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
