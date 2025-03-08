// src/components/InterferenceField.jsx
import React, { useState, useEffect } from 'react';
import '../styles/interference-field.css';

const InterferenceField = ({ isShiftImminent, isShiftActive, shiftProbability }) => {
    // Animation state for the device lights
    const [pulseRate, setPulseRate] = useState(1);

    // Update pulse rate based on shift probability/imminence
    useEffect(() => {
        if (isShiftActive) {
            setPulseRate(5); // Fast pulsing during active shift
        } else if (isShiftImminent) {
            setPulseRate(3); // Medium pulsing when shift is about to happen
        } else {
            setPulseRate(1); // Slow pulsing during normal operation
        }
    }, [isShiftActive, isShiftImminent]);

    return (
        <div className="interference-field">
            <div className="field-device">
                <div className="device-body">
                    <div className="device-display">
                        <div className="display-screen">
                            <div className="probability-meter">
                                <div
                                    className="probability-fill"
                                    style={{ width: `${shiftProbability * 100}%` }}
                                />
                            </div>
                            <div className="shift-status">
                                {isShiftActive ? 'SHIFT ACTIVE' : `Shift Probability: ${Math.round(shiftProbability * 100)}%`}
                            </div>
                        </div>
                    </div>

                    <div className="device-controls">
                        <div className={`indicator-light ${isShiftActive ? 'red-active' : isShiftImminent ? 'yellow-warning' : 'blue-stable'}`}
                             style={{ animationDuration: `${1/pulseRate}s` }}
                        />
                        <div className="device-knobs">
                            <div className="knob"></div>
                            <div className="knob"></div>
                        </div>
                    </div>

                    <div className="device-label">SABACC INTERFERENCE FIELD v2.5</div>
                </div>
            </div>
        </div>
    );
};

export default InterferenceField;
