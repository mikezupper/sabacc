// src/components/Opponents.jsx
import React from 'react';
import Card from './Card';
import CardBack from './CardBack';
import '../styles/components.css';

const Opponents = ({ aiPlayers, gamePhase, winningScore }) => {
    // Determine CSS class based on hand value
    const getValueClass = (handValue) => {
        if (handValue > winningScore) return 'hand-value-bust';
        if (handValue === winningScore) return 'hand-value-perfect';
        return 'hand-value-normal';
    };

    return (
        <section className="opponents-section">
            {aiPlayers.map((player) => (
                <div
                    key={player.id}
                    className={`opponent ${player.folded ? 'opponent-folded' : ''}`}
                >
                    <div className="opponent-header">
                        <h3 className="opponent-name">
                            {player.name}
                            {player.folded && <span className="folded-label">(Folded)</span>}
                        </h3>
                        <div className="opponent-credits">
                            <span className="credits-label">Credits:</span>
                            <span className="credits-value">{player.credits}</span>
                        </div>
                    </div>

                    <div className="cards-container">
                        {gamePhase === 'showdown' ? (
                            <>
                                {player.hand.map((card, index) => (
                                    <Card key={index} card={card} size="small" />
                                ))}
                                <div className={`opponent-hand-value ${getValueClass(player.handValue)}`}>
                                    Value: {player.handValue}
                                </div>
                            </>
                        ) : (
                            <>
                                {player.hand.map((_, index) => (
                                    <CardBack key={index} size="small" />
                                ))}
                            </>
                        )}
                        {player.hand.length === 0 && (
                            <div className="no-cards-message">No cards in hand</div>
                        )}
                    </div>
                </div>
            ))}
        </section>
    );
};

export default Opponents;
