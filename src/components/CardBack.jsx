import React from 'react';
import '../styles/card.css';

const CardBack = ({ size = "normal" }) => {
    // Card dimensions
    const width = size === "small" ? 60 : 80;
    const height = size === "small" ? 90 : 120;
    const cornerRadius = 8;
    const borderWidth = 2;

    return (
        <div className={`card card-${size}`}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
                <rect
                    x={borderWidth / 2}
                    y={borderWidth / 2}
                    width={width - borderWidth}
                    height={height - borderWidth}
                    rx={cornerRadius}
                    ry={cornerRadius}
                    fill="#1e293b"
                    stroke="#f59e0b"
                    strokeWidth={borderWidth}
                />
                <path d={`M10 10 L${width - 10} ${height - 10} M${width - 10} 10 L10 ${height - 10}`} stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />
                <circle cx={width / 2} cy={height / 2} r={width / 5} fill="none" stroke="#f59e0b" strokeWidth="2" />
            </svg>
        </div>
    );
};

export default CardBack;
