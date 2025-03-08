// src/components/PlayerHand.jsx
import React from 'react';
import Card from './Card';
import '../styles/components.css';

const PlayerHand = ({ hand, handValue, winningScore }) => {
    // Determine CSS class based on hand value
    const getValueClass = () => {
        if (handValue > winningScore) return 'hand-value-bust';
        if (handValue === winningScore) return 'hand-value-perfect';
        return 'hand-value-normal';
    };

    return (
        <section className="player-hand">
            <div className="hand-header">
                <h2 className="hand-title">Your Hand</h2>
                <div className={`hand-value ${getValueClass()}`}>
                    Value: {handValue}
                </div>
            </div>

            <div className="cards-container">
                {hand.map((card, index) => (
                    <Card key={index} card={card} />
                ))}
                {hand.length === 0 && (
                    <div className="no-cards-message">No cards in hand</div>
                )}
            </div>
        </section>
    );
};

export default PlayerHand;
