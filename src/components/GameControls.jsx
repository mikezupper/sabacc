// src/components/GameControls.jsx
import React from 'react';
import '../styles/components.css';

const GameControls = ({ gamePhase, currentPlayer, startNewGame, drawCard, stand, fold }) => {
    return (
        <section className="game-controls">
            {gamePhase === 'idle' && (
                <div className="new-game-container">
                    <button
                        onClick={startNewGame}
                        className="new-game-button"
                    >
                        New Game
                    </button>
                </div>
            )}

            {gamePhase === 'playing' && currentPlayer === 0 && (
                <div className="player-actions">
                    <button
                        onClick={drawCard}
                        className="draw-button"
                    >
                        Draw Card
                    </button>
                    <button
                        onClick={stand}
                        className="stand-button"
                    >
                        Stand
                    </button>
                    <button
                        onClick={fold}
                        className="fold-button"
                    >
                        Fold
                    </button>
                </div>
            )}

            {(gamePhase === 'playing' && currentPlayer !== 0) && (
                <div className="waiting-message">
                    Waiting for opponents...
                </div>
            )}
        </section>
    );
};

export default GameControls;
