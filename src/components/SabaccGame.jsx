// src/components/SabaccGame.jsx
import React, { useState, useEffect } from 'react';
import { Shuffle, ChevronDown, ChevronUp, Info, X } from 'lucide-react';
import Card from './Card';
import PlayerHand from './PlayerHand';
import Opponents from './Opponents';
import GameControls from './GameControls';
import GameLog from './GameLog';
import RulesModal from './RulesModal';
import '../styles/components.css';

const SabaccGame = () => {
    // Game constants
    const CARD_VALUES = [
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, // Numbered cards
        -1, -2, -3, -4, -5, -6, -7, -8, -9, -10, // Negative cards
        0, 0, 0, 0, // Zeros
    ];

    const CARD_SUITS = ['Flasks', 'Sabers', 'Staves', 'Coins'];
    const SPECIAL_CARDS = ['Queen of Air and Darkness', 'Master of Coins', 'Idiot', 'Balance'];

    const WINNING_SCORE = 23;
    const BUST_THRESHOLD = 24;
    const NUM_AI_PLAYERS = 2;
    const INITIAL_CREDITS = 1000;
    const ANTE_AMOUNT = 20;
    const MINIMUM_BET = 20;

    // Game state
    const [deck, setDeck] = useState([]);
    const [playerHand, setPlayerHand] = useState([]);
    const [aiPlayers, setAiPlayers] = useState([]);
    const [currentBet, setCurrentBet] = useState(MINIMUM_BET);
    const [pot, setPot] = useState(0);
    const [playerCredits, setPlayerCredits] = useState(INITIAL_CREDITS);
    const [gamePhase, setGamePhase] = useState('idle'); // idle, betting, playing, sabaccShift, showdown
    const [winner, setWinner] = useState(null);
    const [gameMessage, setGameMessage] = useState('Welcome to Sabacc! Start a new game to play.');
    const [currentPlayer, setCurrentPlayer] = useState(0); // 0 is human player, 1+ are AI
    const [roundNumber, setRoundNumber] = useState(0);
    const [gameLog, setGameLog] = useState([]);
    const [showRules, setShowRules] = useState(false);
    const [configRounds, setConfigRounds] = useState(3);
    const [showGameLog, setShowGameLog] = useState(false);

    const startNewGame = () => {
        // Create and shuffle the deck
        const newDeck = createDeck();
        console.log("New deck created:", newDeck.length, "cards");

        // Create AI players
        const newAiPlayers = Array(NUM_AI_PLAYERS).fill().map((_, index) => ({
            id: index + 1,
            name: `Opponent ${index + 1}`,
            hand: [],
            credits: INITIAL_CREDITS - ANTE_AMOUNT, // Deduct ante immediately
            handValue: 0,
            folded: false,
            bet: 0
        }));

        // Calculate the pot (all antes)
        const newPot = ANTE_AMOUNT * (NUM_AI_PLAYERS + 1);

        // Deal 2 cards to human player directly
        let playerCards = [];
        for (let i = 0; i < 2; i++) {
            const card = newDeck.pop();
            playerCards.push(card);
        }

        // Deal 2 cards to each AI player directly
        const updatedAiPlayers = newAiPlayers.map(player => {
            const hand = [];
            for (let i = 0; i < 2; i++) {
                const card = newDeck.pop();
                hand.push(card);
            }

            return {
                ...player,
                hand,
                handValue: calculateHandValue(hand)
            };
        });

        console.log("After dealing, deck has:", newDeck.length, "cards");

        // Set all state at once with a single render cycle
        setDeck(newDeck);
        setPlayerHand(playerCards);
        setAiPlayers(updatedAiPlayers);
        setCurrentBet(MINIMUM_BET);
        setPot(newPot);
        setPlayerCredits(prevCredits => prevCredits - ANTE_AMOUNT);
        setGamePhase('playing');
        setWinner(null);
        setCurrentPlayer(0);
        setRoundNumber(1);
        setGameMessage("It's your turn. Draw, stand, or fold.");
        setGameLog(['New game started!', 'All players paid the ante of ' + ANTE_AMOUNT + ' credits.', 'Initial cards dealt to all players.']);
    };

    // Create and shuffle a new deck
    const createDeck = () => {
        let newDeck = [];

        // Generate regular cards (value and suit)
        CARD_SUITS.forEach(suit => {
            CARD_VALUES.forEach(value => {
                newDeck.push({ value, suit, type: 'regular' });
            });
        });

        // Add special cards
        SPECIAL_CARDS.forEach(name => {
            let value;
            switch (name) {
                case 'Queen of Air and Darkness':
                    value = -2;
                    break;
                case 'Master of Coins':
                    value = -3;
                    break;
                case 'Idiot':
                    value = 0;
                    break;
                case 'Balance':
                    value = 10; // Can be +10 or -10 depending on strategy
                    break;
                default:
                    value = 0;
            }

            newDeck.push({ value, name, type: 'special' });
        });

        // Shuffle the deck
        return shuffleDeck(newDeck);
    };

    // Fisher-Yates shuffle algorithm
    const shuffleDeck = (deck) => {
        const shuffled = [...deck];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    };

    // Calculate the total value of a hand
    const calculateHandValue = (hand) => {
        if (!hand || !Array.isArray(hand) || hand.length === 0) {
            return 0;
        }
        return hand.reduce((total, card) => total + (card ? card.value : 0), 0);
    };

    // Collect antes from all players
    const collectAntes = () => {
        // Deduct ante from human player
        setPlayerCredits(prevCredits => prevCredits - ANTE_AMOUNT);

        // Deduct ante from AI players
        setAiPlayers(prevAiPlayers => prevAiPlayers.map(player => ({
            ...player,
            credits: player.credits - ANTE_AMOUNT
        })));

        // Add antes to pot
        setPot(prevPot => prevPot + ANTE_AMOUNT * (NUM_AI_PLAYERS + 1));

        // Log the ante collection
        addToGameLog('All players paid the ante of ' + ANTE_AMOUNT + ' credits.');

        // Deal initial cards
        setTimeout(() => dealInitialCards(), 500);
    };

    // Deal initial cards to all players
    const dealInitialCards = () => {
        let updatedDeck = [...deck];
        console.log("Before dealing, deck has:", updatedDeck.length, "cards");

        let playerCards = [];
        let updatedAiPlayers = [...aiPlayers];

        // Deal 2 cards to human player
        for (let i = 0; i < 2; i++) {
            const card = updatedDeck.pop();
            playerCards.push(card);
        }

        // Deal 2 cards to each AI player
        updatedAiPlayers = updatedAiPlayers.map(player => {
            const hand = [];
            for (let i = 0; i < 2; i++) {
                const card = updatedDeck.pop();
                hand.push(card);
            }

            return {
                ...player,
                hand,
                handValue: calculateHandValue(hand)
            };
        });

        setPlayerHand(playerCards);
        setAiPlayers(updatedAiPlayers);
        setDeck(updatedDeck);
        setGamePhase('playing');
        setGameMessage("It's your turn. Draw, stand, or fold.");

        addToGameLog('Initial cards dealt to all players.');
        console.log("After dealing, deck has:", updatedDeck.length, "cards");
    };

    // Player draws a card from the deck
    const drawCard = () => {
        if (gamePhase !== 'playing' || currentPlayer !== 0) return;

        if (deck.length > 0) {
            const updatedDeck = [...deck];
            const drawnCard = updatedDeck.pop();

            setPlayerHand(prevHand => [...prevHand, drawnCard]);
            setDeck(updatedDeck);

            addToGameLog('You drew a card.');

            // Check if player busted
            const newHandValue = calculateHandValue([...playerHand, drawnCard]);
            if (newHandValue >= BUST_THRESHOLD) {
                addToGameLog('You busted with a hand value of ' + newHandValue + '!');
                handlePlayerBust();
            } else {
                // Move to next player
                setCurrentPlayer(1);
                setGameMessage("Opponents are taking their turns...");

                // AI players take their turns
                setTimeout(() => aiTakeTurns(), 1000);
            }
        } else {
            setGameMessage("The deck is empty!");
        }
    };

    // Player stands (keeps current hand)
    const stand = () => {
        if (gamePhase !== 'playing' || currentPlayer !== 0) return;

        addToGameLog('You decided to stand.');

        // Move to next player
        setCurrentPlayer(1);
        setGameMessage("Opponents are taking their turns...");

        // AI players take their turns
        setTimeout(() => aiTakeTurns(), 1000);
    };

    // Player folds (gives up on the hand)
    const fold = () => {
        if (gamePhase !== 'playing' || currentPlayer !== 0) return;

        addToGameLog('You folded your hand.');

        // Handle player folding
        setGamePhase('showdown');
        determineWinner(true);
    };

    // Handle player bust (hand value over 23)
    const handlePlayerBust = () => {
        setGamePhase('showdown');
        setGameMessage("You busted! Your hand value exceeds 23.");

        // Determine winner excluding the player
        determineWinner(true);
    };

    // AI players take their turns
    const aiTakeTurns = () => {
        let updatedAiPlayers = [...aiPlayers];
        let updatedDeck = [...deck];

        // Each AI player takes a turn
        for (let i = 0; i < updatedAiPlayers.length; i++) {
            if (updatedAiPlayers[i].folded) continue;

            const player = updatedAiPlayers[i];
            const handValue = player.handValue;

            // AI decision logic
            if (handValue < 16) {
                // Draw a card if hand value is low
                if (updatedDeck.length > 0) {
                    const drawnCard = updatedDeck.pop();
                    player.hand.push(drawnCard);
                    player.handValue = calculateHandValue(player.hand);

                    addToGameLog(`${player.name} drew a card.`);

                    // Check if AI busted
                    if (player.handValue >= BUST_THRESHOLD) {
                        player.folded = true;
                        addToGameLog(`${player.name} busted with a hand value of ${player.handValue}!`);
                    }
                }
            } else if (handValue > 21) {
                // AI might fold if at risk of busting
                const shouldFold = Math.random() > 0.3; // 70% chance to fold if high

                if (shouldFold) {
                    player.folded = true;
                    addToGameLog(`${player.name} folded.`);
                } else {
                    addToGameLog(`${player.name} decided to stand.`);
                }
            } else {
                // Stand with a good hand
                addToGameLog(`${player.name} decided to stand.`);
            }

            updatedAiPlayers[i] = player;
        }

        setAiPlayers(updatedAiPlayers);
        setDeck(updatedDeck);

        // Check if a Sabacc Shift should occur (random chance)
        const shouldShift = Math.random() < 0.2; // 20% chance of a Sabacc Shift

        if (shouldShift && roundNumber < configRounds) {
            setGamePhase('sabaccShift');
            setGameMessage("A Sabacc Shift has occurred! Cards are being exchanged...");
            addToGameLog("A Sabacc Shift has occurred!");

            setTimeout(() => handleSabaccShift(), 1000);
        } else {
            // Check if it's time for showdown
            if (roundNumber >= configRounds) {
                setGamePhase('showdown');
                setGameMessage("Final round completed. Time for the showdown!");
                addToGameLog("Final round completed. Proceeding to showdown!");

                setTimeout(() => determineWinner(false), 1000);
            } else {
                // Next round
                setRoundNumber(prevRound => prevRound + 1);
                setCurrentPlayer(0);
                setGameMessage(`Round ${roundNumber + 1}/${configRounds}: It's your turn. Draw, stand, or fold.`);
            }
        }
    };

    // Handle Sabacc Shift (random card exchanges)
    const handleSabaccShift = () => {
        let updatedDeck = [...deck];
        let updatedPlayerHand = [...playerHand];
        let updatedAiPlayers = [...aiPlayers];

        // Random chance for each player's cards to be affected

        // Player hand
        updatedPlayerHand = updatedPlayerHand.map(card => {
            if (Math.random() < 0.5) { // 50% chance per card
                // Return card to deck and draw new one
                updatedDeck.push(card);
                return updatedDeck.shift();
            }
            return card;
        });

        // AI player hands
        updatedAiPlayers = updatedAiPlayers.map(player => {
            if (player.folded) return player;

            const newHand = player.hand.map(card => {
                if (Math.random() < 0.5) { // 50% chance per card
                    // Return card to deck and draw new one
                    updatedDeck.push(card);
                    return updatedDeck.shift();
                }
                return card;
            });

            return {
                ...player,
                hand: newHand,
                handValue: calculateHandValue(newHand)
            };
        });

        // Shuffle the deck after exchanges
        updatedDeck = shuffleDeck(updatedDeck);

        setPlayerHand(updatedPlayerHand);
        setAiPlayers(updatedAiPlayers);
        setDeck(updatedDeck);

        // Continue play
        setGamePhase('playing');
        setCurrentPlayer(0);
        setGameMessage(`After the Sabacc Shift, it's your turn. Draw, stand, or fold.`);
        addToGameLog("The Sabacc Shift has ended. Play continues.");
    };

    // Determine the winner of the round
    const determineWinner = (playerFolded) => {
        let winningPlayer = null;
        let highestValue = -999;
        let winningMessage = "";

        // If player didn't fold, check their hand
        if (!playerFolded) {
            const playerHandValue = calculateHandValue(playerHand);

            if (playerHandValue <= WINNING_SCORE) {
                highestValue = playerHandValue;
                winningPlayer = "You";
            }
        }

        // Check AI player hands
        aiPlayers.forEach(player => {
            if (player.folded) return;

            if (player.handValue <= WINNING_SCORE && player.handValue > highestValue) {
                highestValue = player.handValue;
                winningPlayer = player.name;
            }
        });

        // Pure Sabacc (exactly 23) or closest to 23
        if (highestValue === WINNING_SCORE) {
            winningMessage = `${winningPlayer} won with a Pure Sabacc (23)!`;
        } else if (winningPlayer) {
            winningMessage = `${winningPlayer} won with a hand value of ${highestValue}!`;
        } else {
            winningMessage = "Everyone busted! The house takes the pot.";
        }

        // Distribute winnings
        if (winningPlayer === "You") {
            setPlayerCredits(prevCredits => prevCredits + pot);
            winningMessage += ` You won ${pot} credits!`;
        } else if (winningPlayer) {
            // Find the AI player and give them the pot
            setAiPlayers(prevAiPlayers => prevAiPlayers.map(player => {
                if (player.name === winningPlayer) {
                    return {
                        ...player,
                        credits: player.credits + pot
                    };
                }
                return player;
            }));

            winningMessage += ` ${winningPlayer} won ${pot} credits!`;
        }

        setWinner(winningPlayer);
        setGameMessage(winningMessage);
        addToGameLog(winningMessage);
        setGamePhase('idle');
    };

    // Add a message to the game log
    const addToGameLog = (message) => {
        setGameLog(prevLog => [...prevLog, message]);
    };

    return (
        <div className="sabacc-game">
            {/* Header Bar */}
            <header className="game-header">
                <div className="header-brand">
                    <h1 className="game-title">STAR WARS SABACC</h1>
                </div>
                <div className="header-controls">
                    <div className="player-credits">
                        <span className="credits-label">Credits:</span>
                        <span className="credits-value">{playerCredits}</span>
                    </div>
                    <button
                        onClick={() => setShowRules(true)}
                        className="rules-button"
                    >
                        <Info size={18} className="icon" /> Rules
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="game-content">
                {/* Game status and pot */}
                <section className="game-status">
                    <div className="game-metrics">
                        <div className="pot-display">
                            <span className="metric-label">Pot: </span>
                            <span className="pot-value">{pot}</span>
                        </div>
                        <div className="round-display">
                            <span className="metric-label">Round: </span>
                            <span className="round-value">{roundNumber}/{configRounds}</span>
                        </div>
                    </div>
                    <div className="game-message">
                        {gamePhase === 'sabaccShift' ? (
                            <div className="sabacc-shift-message">
                                <Shuffle size={20} className="shift-icon" />
                                <span>SABACC SHIFT IN PROGRESS</span>
                            </div>
                        ) : (
                            <span className={winner ? 'winner-message' : ''}>{gameMessage}</span>
                        )}
                    </div>
                    <div className="deck-display">
                        <span className="metric-label">Deck: </span>
                        <span className="deck-value">{deck.length} cards</span>
                    </div>
                </section>

                {/* Player's hand */}
                <PlayerHand
                    hand={playerHand}
                    handValue={calculateHandValue(playerHand)}
                    winningScore={WINNING_SCORE}
                />

                {/* Opponents */}
                <Opponents
                    aiPlayers={aiPlayers}
                    gamePhase={gamePhase}
                    winningScore={WINNING_SCORE}
                />

                {/* Game controls */}
                <GameControls
                    gamePhase={gamePhase}
                    currentPlayer={currentPlayer}
                    startNewGame={startNewGame}
                    drawCard={drawCard}
                    stand={stand}
                    fold={fold}
                />

                {/* Game Log */}
                <GameLog
                    gameLog={gameLog}
                    showGameLog={showGameLog}
                    setShowGameLog={setShowGameLog}
                />
            </main>

            {/* Settings for round configuration */}
            <footer className="game-footer">
                <div className="footer-content">
                    <div className="copyright">
                        © Galaxy Casino Entertainment • Coruscant • Empire approved
                    </div>
                    <div className="game-settings">
                        <div className="rounds-setting">
                            <label htmlFor="rounds" className="setting-label">Rounds:</label>
                            <select
                                id="rounds"
                                value={configRounds}
                                onChange={(e) => setConfigRounds(Number(e.target.value))}
                                className="rounds-select"
                                disabled={gamePhase !== 'idle'}
                            >
                                <option value={1}>1</option>
                                <option value={2}>2</option>
                                <option value={3}>3</option>
                                <option value={4}>4</option>
                                <option value={5}>5</option>
                            </select>
                        </div>
                    </div>
                </div>
            </footer>

            {/* Rules Modal */}
            {showRules && <RulesModal setShowRules={setShowRules} configRounds={configRounds} />}
        </div>
    );
};

export default SabaccGame;
