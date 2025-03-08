// src/components/GameLog.jsx
import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import '../styles/components.css';

const GameLog = ({ gameLog, showGameLog, setShowGameLog }) => {
    return (
        <section className="game-log">
            <div className="log-header">
                <h3 className="log-title">Game Log</h3>
                <button
                    onClick={() => setShowGameLog(!showGameLog)}
                    className="toggle-log-button"
                >
                    {showGameLog ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
            </div>

            {showGameLog && (
                <div className="log-entries">
                    <ul className="log-list">
                        {gameLog.map((log, index) => (
                            <li key={index} className="log-entry">
                                {log}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
};

export default GameLog;
