// src/components/SabaccPot.jsx
import React from 'react';
import '../styles/interference-field.css';

const SabaccPot = ({
                       sabaccPotAmount,
                       isPlayerProtected,
                       canBuyProtection,
                       buyProtection,
                       protectionCost
                   }) => {
    return (
        <div className="sabacc-pot-section">
            <div className="pot-info">
                <span className="metric-label">Sabacc Pot: </span>
                <span className="pot-display">{sabaccPotAmount}</span>
            </div>

            <div className="protection-controls">
                <div className={`protection-status ${isPlayerProtected ? 'protected' : 'unprotected'}`}>
                    {isPlayerProtected ? 'PROTECTED' : 'UNPROTECTED'}
                </div>

                {!isPlayerProtected && canBuyProtection && (
                    <button
                        onClick={buyProtection}
                        className="buy-protection-button"
                    >
                        Buy Protection ({protectionCost})
                    </button>
                )}
            </div>
        </div>
    );
};

export default SabaccPot;
