// DOM Elements - Connection and basic display
const portSelect = document.getElementById('portSelect');
const connectBtn = document.getElementById('connectBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const refreshBtn = document.getElementById('refreshBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const logContainer = document.getElementById('logContainer');
const clearLogBtn = document.getElementById('clearLogBtn');

// Data Display Elements
const weightValue = document.getElementById('weightValue');
const relWeightValue = document.getElementById('relWeightValue');
const tempValue = document.getElementById('tempValue');
const mixerSpeedValue = document.getElementById('mixerSpeedValue');

// Control Elements
const feederSelect = document.getElementById('feederSelect');
const feederAmount = document.getElementById('feederAmount');
const startFeederBtn = document.getElementById('startFeederBtn');
const mixerSpeedSlider = document.getElementById('mixerSpeedSlider');
const mixerSpeedReadout = document.getElementById('mixerSpeedReadout');
const startMixerBtn = document.getElementById('startMixerBtn');
const stopMixerBtn = document.getElementById('stopMixerBtn');
const pidTargetWeight = document.getElementById('pidTargetWeight');
const startPIDBtn = document.getElementById('startPIDBtn');
const stopPIDBtn = document.getElementById('stopPIDBtn');
const waterAmount = document.getElementById('waterAmount');
const waterTemp = document.getElementById('waterTemp');
const setTempBtn = document.getElementById('setTempBtn');
const dispenseWaterBtn = document.getElementById('dispenseWaterBtn');
const stopWaterBtn = document.getElementById('stopWaterBtn');
const tareBtn = document.getElementById('tareBtn');
const tareRelativeBtn = document.getElementById('tareRelativeBtn');
const enableDriversBtn = document.getElementById('enableDriversBtn');
const disableDriversBtn = document.getElementById('disableDriversBtn');

// Global state
let isConnected = false;
let eventSource = null;
let sessionId = null;
let loggingActive = false;

// Chart data and configuration
const maxDataPoints = 100;
let weightData = Array(maxDataPoints).fill(0);
let tempData = Array(maxDataPoints).fill(0);

// Initialize charts
const weightChartCtx = document.getElementById('weightChart').getContext('2d');
const tempChartCtx = document.getElementById('tempChart').getContext('2d');

const weightChart = new Chart(weightChartCtx, {
    type: 'line',
    data: {
        labels: Array(maxDataPoints).fill(''),
        datasets: [{
            label: 'Weight (g)',
            data: weightData,
            borderColor: 'rgba(54, 162, 235, 1)',
            backgroundColor: 'rgba(54, 162, 235, 0.2)',
            borderWidth: 2,
            tension: 0.4,
            fill: true
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: true
            }
        },
        animation: {
            duration: 0
        }
    }
});

const tempChart = new Chart(tempChartCtx, {
    type: 'line',
    data: {
        labels: Array(maxDataPoints).fill(''),
        datasets: [{
            label: 'Temperature (°C)',
            data: tempData,
            borderColor: 'rgba(255, 99, 132, 1)',
            backgroundColor: 'rgba(255, 99, 132, 0.2)',
            borderWidth: 2,
            tension: 0.4,
            fill: true
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            y: {
                beginAtZero: false
            }
        },
        animation: {
            duration: 0
        }
    }
});

// Machine visualization (SVG animation)
let machineVisualization = {
    svg: null,
    mixerRotation: 0,
    animationId: null,
    
    init: function() {
        // Load the SVG into the visualization tab
        fetch('/static/images/machine.svg')
            .then(response => response.text())
            .then(svgData => {
                const container = document.getElementById('machineVisContainer');
                if (container) {
                    container.innerHTML = svgData;
                    this.svg = container.querySelector('svg');
                    this.setupAnimation();
                }
            })
            .catch(error => {
                console.error('Failed to load machine visualization:', error);
            });
    },
    
    setupAnimation: function() {
        if (!this.svg) return;
        
        // Get elements that will be animated
        this.mixerBlades = this.svg.getElementById('mixerBlades');
        this.mixerStatus = this.svg.getElementById('mixerStatus');
        this.waterStatus = this.svg.getElementById('waterStatus');
        this.heaterStatus = this.svg.getElementById('heaterStatus');
        this.feeders = this.svg.querySelectorAll('.feeder');
        
        // Get data display elements
        this.weightDisplay = this.svg.getElementById('weightDisplay');
        this.tempDisplay = this.svg.getElementById('tempDisplay');
        this.mixerSpeedDisplay = this.svg.getElementById('mixerSpeedDisplay');
    },
    
    startAnimation: function() {
        if (this.animationId) return; // Already running
        
        const animate = () => {
            this.animationId = requestAnimationFrame(animate);
            this.updateVisualization();
        };
        
        animate();
    },
    
    stopAnimation: function() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    },
    
    updateVisualization: function() {
        if (!this.svg || !this.mixerBlades) return;
        
        // Update mixer rotation based on mixer speed
        if (isConnected && parseInt(mixerSpeedValue.textContent) > 0) {
            this.mixerRotation += parseInt(mixerSpeedValue.textContent) / 255 * 5;
            this.mixerBlades.setAttribute('transform', `rotate(${this.mixerRotation}, 400, 350)`);
            this.mixerStatus.setAttribute('fill', '#28a745'); // Green when running
        } else {
            this.mixerStatus.setAttribute('fill', '#ccc'); // Gray when stopped
        }
        
        // Update feeder indicators based on active feeder
        this.feeders.forEach(feeder => {
            const feederNum = feeder.getAttribute('data-feeder');
            // Assuming we have an 'activeFeeder' property in the latest_data
            const isActive = window.latest_data && window.latest_data.activeFeeder === parseInt(feederNum);
            
            if (isActive) {
                feeder.querySelector('rect').setAttribute('fill', '#a8d5e5');
                feeder.querySelector('circle').setAttribute('fill', '#28a745');
            } else {
                feeder.querySelector('rect').setAttribute('fill', '#ddd');
                feeder.querySelector('circle').setAttribute('fill', '#999');
            }
        });
        
        // Update readings display
        if (this.weightDisplay) {
            this.weightDisplay.textContent = `Weight: ${weightValue.textContent}g`;
        }
        if (this.tempDisplay) {
            this.tempDisplay.textContent = `Temp: ${tempValue.textContent}°C`;
        }
        if (this.mixerSpeedDisplay) {
            this.mixerSpeedDisplay.textContent = `Mixer: ${mixerSpeedValue.textContent}/255`;
        }
    }
};

// Functions for UI interaction
function addLogEntry(message, type = 'system') {
    const entry = document.createElement('div');
    entry.classList.add('log-entry', `log-entry-${type}`);
    
    const timestamp = new Date().toLocaleTimeString();
    entry.textContent = `[${timestamp}] ${message}`;
    
    logContainer.appendChild(entry);
    logContainer.scrollTop = logContainer.scrollHeight;
}

function updateConnectionStatus(connected) {
    isConnected = connected;
    
    if (connected) {
        statusIndicator.classList.remove('disconnected');
        statusIndicator.classList.add('connected');
        statusText.textContent = I18N.get('app.connection.connected', 'Connected');
        connectBtn.disabled = true;
        disconnectBtn.disabled = false;
        
        // Start machine visualization
        machineVisualization.startAnimation();
    } else {
        statusIndicator.classList.remove('connected');
        statusIndicator.classList.add('disconnected');
        statusText.textContent = I18N.get('app.connection.disconnected', 'Disconnected');
        connectBtn.disabled = false;
        disconnectBtn.disabled = true;
        
        // Stop machine visualization
        machineVisualization.stopAnimation();
    }
}

function refreshPorts() {
    fetch('/api/ports')
        .then(response => response.json())
        .then(ports => {
            portSelect.innerHTML = `<option value="">${I18N.get('app.connection.select_port', 'Select COM Port')}</option>`;
            
            ports.forEach(port => {
                const option = document.createElement('option');
                option.value = port;
                option.textContent = port;
                portSelect.appendChild(option);
            });
            
            addLogEntry('COM ports refreshed');
        })
        .catch(error => {
            addLogEntry(`Failed to refresh ports: ${error.message}`, 'error');
        });
}

function connect() {
    const port = portSelect.value;
    
    if (!port) {
        addLogEntry('Please select a COM port', 'error');
        return;
    }
    
    fetch('/api/connect', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ port })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                sessionId = data.session_id;
                updateConnectionStatus(true);
                addLogEntry(data.message);
                startEventSource();
            } else {
                addLogEntry(data.error, 'error');
            }
        })
        .catch(error => {
            addLogEntry(`Connection error: ${error.message}`, 'error');
        });
}

function disconnect() {
    fetch('/api/disconnect', {
        method: 'POST'
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                updateConnectionStatus(false);
                addLogEntry(data.message);
                
                if (eventSource) {
                    eventSource.close();
                    eventSource = null;
                }
                
                // Stop data logging if active
                if (loggingActive) {
                    stopLogging();
                }
            } else {
                addLogEntry(data.error, 'error');
            }
        })
        .catch(error => {
            addLogEntry(`Disconnection error: ${error.message}`, 'error');
        });
}

function startEventSource() {
    if (eventSource) {
        eventSource.close();
    }
    
    eventSource = new EventSource('/api/stream');
    
    eventSource.onmessage = function(event) {
        const data = JSON.parse(event.data);
        
        // Store latest data globally for access by visualization
        window.latest_data = data;
        
        // Update display values
        weightValue.textContent = data.weight.toFixed(1);
        relWeightValue.textContent = data.relativeWeight.toFixed(1);
        tempValue.textContent = data.temperature.toFixed(1);
        mixerSpeedValue.textContent = data.mixerSpeed;
        
        // Update charts
        updateCharts(data.weight, data.temperature);
    };
    
    eventSource.onerror = function() {
        addLogEntry('SSE connection error. Reconnecting...', 'error');
        updateConnectionStatus(false);
        
        // Attempt to reconnect
        setTimeout(startEventSource, 2000);
    };
}

function updateCharts(weight, temp) {
    // Update weight chart data
    weightData.push(weight);
    weightData.shift();
    weightChart.data.datasets[0].data = weightData;
    weightChart.update();
    
    // Update temperature chart data
    tempData.push(temp);
    tempData.shift();
    tempChart.data.datasets[0].data = tempData;
    tempChart.update();
}

function sendCommand(command) {
    if (!isConnected) {
        addLogEntry('Not connected to device', 'error');
        return Promise.reject(new Error('Not connected'));
    }
    
    addLogEntry(`Sending command: ${command}`, 'command');
    
    return fetch('/api/command', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command })
    })
        .then(response => response.json())
        .then(data => {
            if (!data.success) {
                throw new Error(data.error);
            }
            return data;
        })
        .catch(error => {
            addLogEntry(`Command error: ${error.message}`, 'error');
            throw error;
        });
}

// Data logging functions
function startLogging() {
    if (!isConnected) {
        addLogEntry('Cannot start logging: Not connected to device', 'error');
        return;
    }
    
    fetch('/api/logging/start', {
        method: 'POST'
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                loggingActive = true;
                sessionId = data.session_id;
                addLogEntry(`Data logging started for session ${sessionId}`, 'system');
                
                // Update UI
                document.getElementById('startLoggingBtn').disabled = true;
                document.getElementById('stopLoggingBtn').disabled = false;
            } else {
                addLogEntry(data.error, 'error');
            }
        })
        .catch(error => {
            addLogEntry(`Failed to start logging: ${error.message}`, 'error');
        });
}

function stopLogging() {
    if (!loggingActive) {
        addLogEntry('Logging is not active', 'error');
        return;
    }
    
    fetch('/api/logging/stop', {
        method: 'POST'
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                loggingActive = false;
                addLogEntry(data.message, 'system');
                
                // Update UI
                document.getElementById('startLoggingBtn').disabled = false;
                document.getElementById('stopLoggingBtn').disabled = true;
                
                // Refresh sessions list
                loadLogSessions();
            } else {
                addLogEntry(data.error, 'error');
            }
        })
        .catch(error => {
            addLogEntry(`Failed to stop logging: ${error.message}`, 'error');
        });
}

function loadLogSessions() {
    fetch('/api/logging/sessions')
        .then(response => response.json())
        .then(sessions => {
            const tbody = document.getElementById('sessionsTable');
            if (!tbody) return;
            
            tbody.innerHTML = '';
            
            sessions.forEach(session => {
                const row = document.createElement('tr');
                
                // ID column
                const idCell = document.createElement('td');
                idCell.textContent = session.id;
                
                // Date column
                const dateCell = document.createElement('td');
                const date = new Date(session.created);
                dateCell.textContent = date.toLocaleString();
                
                // Size column
                const sizeCell = document.createElement('td');
                const sizeKB = (session.size / 1024).toFixed(2);
                sizeCell.textContent = `${sizeKB} KB`;
                
                // Actions column
                const actionsCell = document.createElement('td');
                
                const downloadJsonBtn = document.createElement('button');
                downloadJsonBtn.className = 'btn btn-sm btn-primary me-1';
                downloadJsonBtn.innerHTML = '<i class="bi bi-file-earmark-code"></i>';
                downloadJsonBtn.title = 'Download JSON';
                downloadJsonBtn.addEventListener('click', () => {
                    window.open(`/api/logging/download/session_${session.id}.json`);
                });
                
                const downloadCsvBtn = document.createElement('button');
                downloadCsvBtn.className = 'btn btn-sm btn-success me-1';
                downloadCsvBtn.innerHTML = '<i class="bi bi-file-earmark-spreadsheet"></i>';
                downloadCsvBtn.title = 'Download CSV';
                downloadCsvBtn.addEventListener('click', () => {
                    window.open(`/api/logging/download/session_${session.id}.csv`);
                });
                
                actionsCell.appendChild(downloadJsonBtn);
                actionsCell.appendChild(downloadCsvBtn);
                
                row.appendChild(idCell);
                row.appendChild(dateCell);
                row.appendChild(sizeCell);
                row.appendChild(actionsCell);
                
                tbody.appendChild(row);
            });
        })
        .catch(error => {
            addLogEntry(`Failed to load sessions: ${error.message}`, 'error');
        });
}

// System testing functions
function runSystemTest(testName) {
    if (!isConnected) {
        addLogEntry('Cannot run test: Not connected to device', 'error');
        return;
    }
    
    fetch('/api/system/test', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ test: testName })
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                addLogEntry(data.message, 'system');
            } else {
                addLogEntry(data.error, 'error');
            }
        })
        .catch(error => {
            addLogEntry(`Failed to run test: ${error.message}`, 'error');
        });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    refreshPorts();
    
    // Initialize machine visualization
    machineVisualization.init();
    
    // Add tab change event listener to start/stop visualization
    const visualizationTab = document.getElementById('visualization-tab');
    if (visualizationTab) {
        visualizationTab.addEventListener('shown.bs.tab', () => {
            if (isConnected) {
                machineVisualization.startAnimation();
            }
        });
        
        visualizationTab.addEventListener('hidden.bs.tab', () => {
            machineVisualization.stopAnimation();
        });
    }
    
    // Basic control listeners
    refreshBtn.addEventListener('click', refreshPorts);
    connectBtn.addEventListener('click', connect);
    disconnectBtn.addEventListener('click', disconnect);
    clearLogBtn.addEventListener('click', () => {
        logContainer.innerHTML = '';
        addLogEntry('Log cleared');
    });
    
    // Feeder Controls
    startFeederBtn.addEventListener('click', () => {
        const feederNum = feederSelect.value;
        const amount = feederAmount.value;
        
        sendCommand(`feeder${feederNum}+${amount}`);
    });
    
    // Mixer Controls
    mixerSpeedSlider.addEventListener('input', () => {
        mixerSpeedReadout.textContent = mixerSpeedSlider.value;
    });
    
    startMixerBtn.addEventListener('click', () => {
        const speed = mixerSpeedSlider.value;
        sendCommand(`mixerspeed+${speed}`);
    });
    
    stopMixerBtn.addEventListener('click', () => {
        sendCommand('mixerstop');
    });
    
    startPIDBtn.addEventListener('click', () => {
        const target = pidTargetWeight.value;
        sendCommand(`wheat+${target}`);
    });
    
    stopPIDBtn.addEventListener('click', () => {
        sendCommand('wheatstop');
    });
    
    // Water Controls
    setTempBtn.addEventListener('click', () => {
        const temp = waterTemp.value;
        sendCommand(`settemp+${temp}`);
    });
    
    dispenseWaterBtn.addEventListener('click', () => {
        const amount = waterAmount.value;
        sendCommand(`water+${amount}`);
    });
    
    stopWaterBtn.addEventListener('click', () => {
        sendCommand('stopwater');
    });
    
    // Scale Controls
    tareBtn.addEventListener('click', () => {
        sendCommand('tare');
    });
    
    tareRelativeBtn.addEventListener('click', () => {
        sendCommand('tarerelative');
    });
    
    // Motor Controls
    enableDriversBtn.addEventListener('click', () => {
        sendCommand('enabledrivers');
    });
    
    disableDriversBtn.addEventListener('click', () => {
        sendCommand('disabledrivers');
    });
    
    // Data Logging tab
    const startLoggingBtn = document.getElementById('startLoggingBtn');
    const stopLoggingBtn = document.getElementById('stopLoggingBtn');
    const refreshSessionsBtn = document.getElementById('refreshSessionsBtn');
    
    if (startLoggingBtn) {
        startLoggingBtn.addEventListener('click', startLogging);
    }
    
    if (stopLoggingBtn) {
        stopLoggingBtn.addEventListener('click', stopLogging);
    }
    
    if (refreshSessionsBtn) {
        refreshSessionsBtn.addEventListener('click', loadLogSessions);
    }
    
    // System Test tab
    const feederTestBtn = document.getElementById('feederTestBtn');
    const mixerTestBtn = document.getElementById('mixerTestBtn');
    const waterTestBtn = document.getElementById('waterTestBtn');
    const scaleTestBtn = document.getElementById('scaleTestBtn');
    
    if (feederTestBtn) {
        feederTestBtn.addEventListener('click', () => runSystemTest('feeders'));
    }
    
    if (mixerTestBtn) {
        mixerTestBtn.addEventListener('click', () => runSystemTest('mixer'));
    }
    
    if (waterTestBtn) {
        waterTestBtn.addEventListener('click', () => runSystemTest('water'));
    }
    
    if (scaleTestBtn) {
        scaleTestBtn.addEventListener('click', () => runSystemTest('scale'));
    }
    
    // When logging tab is shown, load sessions
    const loggingTab = document.getElementById('logging-tab');
    if (loggingTab) {
        loggingTab.addEventListener('shown.bs.tab', loadLogSessions);
    }
}); 