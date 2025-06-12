import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import VideoGeneration from './components/VideoGeneration';
import Voting from './components/Voting';
import BuyHonors from './components/BuyHonors';
import AuthButton from './components/AuthButton';
import BalanceDebugger from './components/BalanceDebugger';
import { Web3Provider } from './context/Web3Context';

function App() {
  return (
    <Web3Provider>
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
                <li>
                  <Link to="/debug">Debug</Link>
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
              <Route path="/debug" element={<BalanceDebugger />} />
            </Routes>
          </main>
          <footer>
          {/* Footer content removed as requested */}
        </footer>
        </div>
      </Router>
    </Web3Provider>
  );
}

export default App;
