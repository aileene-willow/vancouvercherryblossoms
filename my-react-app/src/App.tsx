import React from 'react';
import './App.css';
import CherryBlossoms from './components/CherryBlossoms';
import './components/CherryBlossoms.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Let's plan your cherry blossom tour!</h1>
      </header>
      <main>
        <CherryBlossoms />
      </main>
    </div>
  );
}

export default App;
