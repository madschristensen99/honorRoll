import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import VideoGeneration from './components/VideoGeneration';
import Voting from './components/Voting';
import BuyHonors from './components/BuyHonors';
import AuthButton from './components/AuthButton';

function App() {

  return (
    <Router>
      <div className="App">
        <header className="App-header">
          <h1>Honor Roll</h1>
          <nav>
            <ul className="nav-links">
              <li>
                <Link to="/">Create</Link>
              </li>
              <li>
                <Link to="/voting">Vote</Link>
              </li>
              <li>
                <Link to="/buy">Buy Honors</Link>
              </li>
            </ul>
          </nav>
          <AuthButton />
        </header>
        <main>
          <Routes>
            <Route path="/" element={<VideoGeneration />} />
            <Route path="/voting" element={<Voting />} />
            <Route path="/buy" element={<BuyHonors />} />
          </Routes>
        </main>
        <footer>
        {/* Footer content removed as requested */}
      </footer>
      </div>
    </Router>
  );
}

export default App;
