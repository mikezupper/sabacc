// src/components/RulesModal.jsx
import React from 'react';
import { X } from 'lucide-react';
import '../styles/components.css';

const RulesModal = ({ setShowRules, configRounds }) => {
    return (
        <div className="rules-modal-overlay">
            <div className="rules-modal">
                <button
                    onClick={() => setShowRules(false)}
                    className="close-rules-button"
                >
                    <X size={24} />
                </button>

                <h2 className="rules-title">Sabacc Rules</h2>

                <div className="rules-content">
                    <section className="rules-section">
                        <h3 className="section-title">Basic Objective</h3>
                        <p>The goal is to have a hand with a value as close to 23 as possible without exceeding it. The player with the highest hand value at showdown wins the pot, as long as they don't exceed 23.</p>
                    </section>

                    <section className="rules-section">
                        <h3 className="section-title">Cards and Values</h3>
                        <ul className="rules-list">
                            <li><span className="positive-card">Regular Cards:</span> Range from +1 to +10 (green border) and -1 to -10 (red border)</li>
                            <li><span className="zero-card">Zero Cards:</span> Worth 0 points (blue border)</li>
                            <li><span className="special-card">Special Cards:</span></li>
                            <ul className="special-cards-list">
                                <li>Queen of Air and Darkness (-2)</li>
                                <li>Master of Coins (-3)</li>
                                <li>Idiot (0)</li>
                                <li>Balance (can be +10 or -10)</li>
                            </ul>
                        </ul>
                    </section>

                    <section className="rules-section">
                        <h3 className="section-title">Game Flow</h3>
                        <ol className="game-flow-list">
                            <li>
                                <span className="phase-title">Betting Phase</span>
                                <ul className="phase-details">
                                    <li>Each player pays an ante (20 credits) to join the game</li>
                                    <li>This creates the initial pot</li>
                                </ul>
                            </li>
                            <li>
                                <span className="phase-title">Initial Deal</span>
                                <ul className="phase-details">
                                    <li>Each player receives 2 cards</li>
                                    <li>Your hand value is the sum of all card values</li>
                                </ul>
                            </li>
                            <li>
                                <span className="phase-title">Action Rounds</span> ({configRounds} rounds total)
                                <ul className="phase-details">
                                    <li>On your turn, you can:</li>
                                    <ul className="action-options">
                                        <li><span className="draw-action">Draw Card:</span> Take another card from the deck</li>
                                        <li><span className="stand-action">Stand:</span> Keep your current hand</li>
                                        <li><span className="fold-action">Fold:</span> Give up on the hand and lose your ante</li>
                                    </ul>
                                    <li>AI players take their turns after you</li>
                                </ul>
                            </li>
                            <li>
                                <span className="phase-title">Sabacc Shift</span>
                                <ul className="phase-details">
                                    <li>Random event (20% chance after each round)</li>
                                    <li>Cards may be randomly exchanged with new ones from the deck</li>
                                    <li>This represents the unpredictable nature of the game in Star Wars lore</li>
                                </ul>
                            </li>
                            <li>
                                <span className="phase-title">Showdown</span>
                                <ul className="phase-details">
                                    <li>After {configRounds} rounds or if players fold/bust</li>
                                    <li>The player with the highest hand value ≤ 23 wins</li>
                                    <li>If you get exactly 23, that's a "Pure Sabacc" (best possible hand)</li>
                                </ul>
                            </li>
                        </ol>
                    </section>

                    <section className="rules-section">
                        <h3 className="section-title">Winning and Losing</h3>

                        <div className="win-conditions">
                            <h4 className="conditions-title win-title">Ways to Win</h4>
                            <ul className="conditions-list">
                                <li>Have the highest hand value without exceeding 23 when the showdown occurs</li>
                                <li>Be the last player remaining if all others fold or bust</li>
                                <li>Get a "Pure Sabacc" (exactly 23)</li>
                            </ul>
                        </div>

                        <div className="lose-conditions">
                            <h4 className="conditions-title lose-title">Ways to Lose</h4>
                            <ul className="conditions-list">
                                <li><span className="condition-label">Bust:</span> If your hand value exceeds 23, you automatically lose</li>
                                <li><span className="condition-label">Fold:</span> If you choose to give up your hand, you forfeit the pot</li>
                                <li><span className="condition-label">Lower Hand:</span> Having a lower valid hand than another player at showdown</li>
                            </ul>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default RulesModal;
