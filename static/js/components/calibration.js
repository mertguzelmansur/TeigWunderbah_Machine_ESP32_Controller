// Calibration Component
const CalibrationManager = {
    // Calibration data
    calibrationData: {
        loadCell: {
            factor: -454.562,
            offset: 0,
            knownWeight: 500
        },
        temperature: {
            offset: 0
        },
        motor: {
            factor: 1.0
        }
    },
    
    // Calibration state
    calibrationActive: false,
    
    // Initialize the calibration manager
    init: function() {
        // Add event listeners
        document.getElementById('startCalibrationBtn').addEventListener('click', this.startCalibration.bind(this));
        document.getElementById('saveCalibrationBtn').addEventListener('click', this.saveCalibration.bind(this));
        document.getElementById('applyTempCalibBtn').addEventListener('click', this.applyTempCalibration.bind(this));
        document.getElementById('applyMotorCalibBtn').addEventListener('click', this.applyMotorCalibration.bind(this));
        
        // Load existing calibration data if available
        this.loadCalibrationData();
    },
    
    // Load existing calibration data
    loadCalibrationData: function() {
        fetch('/api/calibration')
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    this.calibrationData = data.calibration;
                    this.updateUI();
                }
            })
            .catch(error => {
                console.error('Failed to load calibration data:', error);
            });
    },
    
    // Update UI with current calibration values
    updateUI: function() {
        document.getElementById('knownWeight').value = this.calibrationData.loadCell.knownWeight;
        document.getElementById('tempOffset').value = this.calibrationData.temperature.offset;
        document.getElementById('motorCalibration').value = this.calibrationData.motor.factor;
    },
    
    // Start load cell calibration process
    startCalibration: function() {
        if (!isConnected) {
            addLogEntry('Please connect to the device first', 'error');
            return;
        }
        
        this.calibrationActive = true;
        const knownWeight = parseFloat(document.getElementById('knownWeight').value);
        
        // Update known weight in calibration data
        this.calibrationData.loadCell.knownWeight = knownWeight;
        
        // Steps for calibration:
        // 1. Tare the scale (empty)
        // 2. Ask user to place known weight
        // 3. Calculate calibration factor
        
        // Step 1: Tare the scale
        sendCommand('tare')
            .then(() => {
                addLogEntry('Scale tared. Please place the known weight on the scale.', 'system');
                
                // Create a confirmation button
                const confirmDiv = document.createElement('div');
                confirmDiv.id = 'confirmWeightDiv';
                confirmDiv.className = 'alert alert-info mt-3';
                confirmDiv.innerHTML = `
                    <p>Place the ${knownWeight}g weight on the scale, then click "Weight Placed".</p>
                    <button id="confirmWeightBtn" class="btn btn-primary">Weight Placed</button>
                `;
                
                // Insert before the calibration instructions
                const btnContainer = document.getElementById('saveCalibrationBtn').parentNode;
                btnContainer.parentNode.insertBefore(confirmDiv, btnContainer.nextSibling);
                
                // Add click event for confirmation
                document.getElementById('confirmWeightBtn').addEventListener('click', () => {
                    this.calculateCalibrationFactor();
                    document.getElementById('confirmWeightDiv').remove();
                });
            })
            .catch(error => {
                this.calibrationActive = false;
                addLogEntry('Calibration failed: ' + error.message, 'error');
            });
    },
    
    // Calculate calibration factor based on known weight
    calculateCalibrationFactor: function() {
        // Get current weight reading from the weight display
        const currentReading = parseFloat(document.getElementById('weightValue').textContent);
        const knownWeight = this.calibrationData.loadCell.knownWeight;
        
        if (currentReading <= 0) {
            addLogEntry('Invalid weight reading. Please try again.', 'error');
            this.calibrationActive = false;
            return;
        }
        
        // Calculate new calibration factor
        // Formula: new_factor = old_factor * (known_weight / current_reading)
        const oldFactor = this.calibrationData.loadCell.factor;
        const newFactor = oldFactor * (knownWeight / currentReading);
        
        this.calibrationData.loadCell.factor = newFactor;
        
        addLogEntry(`Calibration factor calculated: ${newFactor.toFixed(3)}`, 'system');
        this.calibrationActive = false;
        
        // Display the result
        const resultDiv = document.createElement('div');
        resultDiv.id = 'calibResultDiv';
        resultDiv.className = 'alert alert-success mt-3';
        resultDiv.innerHTML = `
            <p>Calibration complete:</p>
            <ul>
                <li>Known weight: ${knownWeight}g</li>
                <li>Measured weight: ${currentReading.toFixed(1)}g</li>
                <li>New factor: ${newFactor.toFixed(3)}</li>
            </ul>
            <p>Click "Save Calibration" to store these results.</p>
        `;
        
        // Insert before the calibration instructions
        const btnContainer = document.getElementById('saveCalibrationBtn').parentNode;
        
        // Remove previous result if exists
        const prevResult = document.getElementById('calibResultDiv');
        if (prevResult) {
            prevResult.remove();
        }
        
        btnContainer.parentNode.insertBefore(resultDiv, btnContainer.nextSibling);
    },
    
    // Save calibration data
    saveCalibration: function() {
        fetch('/api/calibration/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(this.calibrationData)
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    addLogEntry(data.message, 'system');
                    
                    // Apply calibration to device if connected
                    if (isConnected) {
                        // For now, we just print the command that would be sent
                        // In a real implementation, we would send commands to update the ESP32 calibration
                        addLogEntry(`Calibration would be applied to device with factor: ${this.calibrationData.loadCell.factor.toFixed(3)}`, 'system');
                    }
                } else {
                    addLogEntry(data.error, 'error');
                }
            })
            .catch(error => {
                addLogEntry(`Failed to save calibration: ${error.message}`, 'error');
            });
    },
    
    // Apply temperature calibration
    applyTempCalibration: function() {
        if (!isConnected) {
            addLogEntry('Please connect to the device first', 'error');
            return;
        }
        
        const tempOffset = parseFloat(document.getElementById('tempOffset').value);
        this.calibrationData.temperature.offset = tempOffset;
        
        // In a real implementation, we would send a command to update the ESP32 temperature calibration
        addLogEntry(`Temperature offset set to ${tempOffset.toFixed(1)}°C`, 'system');
        
        // Save calibration data
        this.saveCalibration();
    },
    
    // Apply motor calibration
    applyMotorCalibration: function() {
        if (!isConnected) {
            addLogEntry('Please connect to the device first', 'error');
            return;
        }
        
        const motorFactor = parseFloat(document.getElementById('motorCalibration').value);
        this.calibrationData.motor.factor = motorFactor;
        
        // In a real implementation, we would send a command to update the ESP32 motor calibration
        addLogEntry(`Motor calibration factor set to ${motorFactor.toFixed(2)}`, 'system');
        
        // Save calibration data
        this.saveCalibration();
    }
};

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if the calibration tab exists
    if (document.getElementById('calibration-tab')) {
        CalibrationManager.init();
    }
}); 