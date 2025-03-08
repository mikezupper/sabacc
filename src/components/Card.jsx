// src/components/Card.jsx
import React from 'react';
import '../styles/card.css';

const Card = ({ card, size = "normal" }) => {
    if (!card) return null;

    // Generate SVG card content
    const getSvgCard = () => {
        const isSpecial = card.type === 'special';
        const cardValue = card.value;
        let suitSymbol = '';
        let suitColor = '';
        let borderColor = '';
        let valueDisplay = '';

        // Determine card styling based on value and type
        if (cardValue > 0) {
            borderColor = '#4ade80'; // Green
            valueDisplay = `+${cardValue}`;
        } else if (cardValue < 0) {
            borderColor = '#ef4444'; // Red
            valueDisplay = `${cardValue}`;
        } else {
            borderColor = '#3b82f6'; // Blue
            valueDisplay = '0';
        }

        if (isSpecial) {
            borderColor = '#f59e0b'; // Amber for special cards
        }

        // Set suit symbol and color
        if (!isSpecial) {
            switch (card.suit) {
                case 'Flasks':
                    suitSymbol = '⚗️';
                    suitColor = '#9333ea'; // Purple
                    break;
                case 'Sabers':
                    suitSymbol = '⚔️';
                    suitColor = '#0ea5e9'; // Sky blue
                    break;
                case 'Staves':
                    suitSymbol = '🏑';
                    suitColor = '#65a30d'; // Lime
                    break;
                case 'Coins':
                    suitSymbol = '💰';
                    suitColor = '#f59e0b'; // Amber
                    break;
                default:
                    suitSymbol = '⚪';
                    suitColor = '#6b7280'; // Gray
            }
        }

        // Card dimensions
        const width = size === "small" ? 60 : 80;
        const height = size === "small" ? 90 : 120;
        const cornerRadius = 8;
        const borderWidth = 2;

        return (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
                {/* Card background */}
                <rect
                    x={borderWidth / 2}
                    y={borderWidth / 2}
                    width={width - borderWidth}
                    height={height - borderWidth}
                    rx={cornerRadius}
                    ry={cornerRadius}
                    fill="#1e293b"
                    stroke={borderColor}
                    strokeWidth={borderWidth}
                />

                {/* Card value */}
                <text
                    x={width / 2}
                    y={height / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize={size === "small" ? 20 : 24}
                    fontWeight="bold"
                >
                    {valueDisplay}
                </text>

                {/* Top left info */}
                {isSpecial ? (
                    <text
                        x={6}
                        y={12}
                        fill="#f8fafc"
                        fontSize={size === "small" ? 6 : 8}
                    >
                        {card.name.substring(0, 10)}...
                    </text>
                ) : (
                    <>
                        <text
                            x={6}
                            y={12}
                            fill="#f8fafc"
                            fontSize={size === "small" ? 8 : 10}
                        >
                            {valueDisplay}
                        </text>
                        <text
                            x={6}
                            y={22}
                            fill={suitColor}
                            fontSize={size === "small" ? 8 : 10}
                        >
                            {suitSymbol}
                        </text>
                    </>
                )}

                {/* Bottom right info */}
                {isSpecial ? (
                    <text
                        x={width - 6}
                        y={height - 12}
                        textAnchor="end"
                        fill="#f59e0b"
                        fontSize={size === "small" ? 6 : 8}
                    >
                        SPECIAL
                    </text>
                ) : (
                    <>
                        <text
                            x={width - 6}
                            y={height - 12}
                            textAnchor="end"
                            fill="#f8fafc"
                            fontSize={size === "small" ? 8 : 10}
                        >
                            {valueDisplay}
                        </text>
                        <text
                            x={width - 6}
                            y={height - 22}
                            textAnchor="end"
                            fill={suitColor}
                            fontSize={size === "small" ? 8 : 10}
                        >
                            {suitSymbol}
                        </text>
                    </>
                )}

                {/* Card center decoration */}
                {!isSpecial && (
                    <text
                        x={width / 2}
                        y={height / 2 + (size === "small" ? 20 : 30)}
                        textAnchor="middle"
                        fill={suitColor}
                        fontSize={size === "small" ? 12 : 16}
                    >
                        {suitSymbol}
                    </text>
                )}


                {isSpecial && (
                    <text
                        x={width / 2}
                        y={height / 2 + (size === "small" ? 20 : 30)}
                        textAnchor="middle"
                        fill="#f59e0b"
                        fontSize={size === "small" ? 10 : 12}
                    >
                        {card.name.split(' ').slice(0, 2).join(' ')}
                    </text>
                )}
            </svg>
        );
    };

    return (
        <div className={`card card-${size}`}>
            {getSvgCard()}

            {/* Hover tooltip for card details */}
            <div className="card-tooltip">
                {card.type === 'special' ? (
                    <div>
                        <div className="tooltip-title">{card.name}</div>
                        <div>Value: {card.value}</div>
                        <div className="special-label">Special Card</div>
                    </div>
                ) : (
                    <div>
                        <div className="tooltip-title">
                            {card.value > 0 ? '+' : ''}{card.value} of {card.suit}
                        </div>
                        <div>Value: {card.value}</div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Card;
