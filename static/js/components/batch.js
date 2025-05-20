// Batch Processing Component
const BatchProcessor = {
    // Current batch commands
    commands: [],
    
    // Initialize the batch processor
    init: function() {
        // Add event listeners
        document.getElementById('addBatchCommandBtn').addEventListener('click', this.addCommand.bind(this));
        document.getElementById('executeBatchBtn').addEventListener('click', this.executeBatch.bind(this));
        document.getElementById('clearBatchBtn').addEventListener('click', this.clearCommands.bind(this));
        
        // Initialize commands list
        this.renderCommandsList();
    },
    
    // Add a new command to the batch
    addCommand: function() {
        const commandTypes = [
            { value: 'feeder', label: 'Feeder' },
            { value: 'mixer', label: 'Mixer' },
            { value: 'water', label: 'Water' },
            { value: 'scale', label: 'Scale' },
            { value: 'motor', label: 'Motor' }
        ];
        
        // Create a command selection dropdown
        const commandTypeSelect = document.createElement('select');
        commandTypeSelect.className = 'form-select';
        
        commandTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type.value;
            option.textContent = type.label;
            commandTypeSelect.appendChild(option);
        });
        
        // Show a custom modal for command selection
        const modalHtml = `
            <div class="modal fade" id="commandModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Add Command</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body" id="commandModalBody">
                            <div class="mb-3">
                                <label class="form-label">Command Type</label>
                                <div id="commandTypeContainer"></div>
                            </div>
                            <div id="commandParamsContainer"></div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" id="saveCommandBtn">Add Command</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Append modal to body if it doesn't exist
        if (!document.getElementById('commandModal')) {
            const modalContainer = document.createElement('div');
            modalContainer.innerHTML = modalHtml;
            document.body.appendChild(modalContainer);
        }
        
        // Get the modal element
        const modal = new bootstrap.Modal(document.getElementById('commandModal'));
        
        // Add the command type select to the modal
        const commandTypeContainer = document.getElementById('commandTypeContainer');
        commandTypeContainer.innerHTML = '';
        commandTypeContainer.appendChild(commandTypeSelect);
        
        // Add change listener to update parameters based on command type
        commandTypeSelect.addEventListener('change', () => {
            this.updateCommandParams(commandTypeSelect.value);
        });
        
        // Initial parameters update
        this.updateCommandParams(commandTypeSelect.value);
        
        // Add save button handler
        document.getElementById('saveCommandBtn').addEventListener('click', () => {
            const commandType = commandTypeSelect.value;
            const command = this.buildCommand(commandType);
            
            if (command) {
                this.commands.push(command);
                this.renderCommandsList();
                modal.hide();
            }
        });
        
        // Show the modal
        modal.show();
    },
    
    // Update command parameters based on command type
    updateCommandParams: function(commandType) {
        const container = document.getElementById('commandParamsContainer');
        container.innerHTML = '';
        
        let html = '';
        
        switch (commandType) {
            case 'feeder':
                html = `
                    <div class="mb-3">
                        <label class="form-label">Feeder Number</label>
                        <select id="feederNumber" class="form-select">
                            <option value="1">Feeder 1</option>
                            <option value="2">Feeder 2</option>
                            <option value="3">Feeder 3</option>
                            <option value="4">Feeder 4</option>
                            <option value="5">Feeder 5</option>
                            <option value="6">Feeder 6</option>
                            <option value="7">Feeder 7</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">Amount (g)</label>
                        <input type="number" id="feederAmount" class="form-control" value="100">
                    </div>
                `;
                break;
                
            case 'mixer':
                html = `
                    <div class="mb-3">
                        <label class="form-label">Action</label>
                        <select id="mixerAction" class="form-select">
                            <option value="speed">Set Speed</option>
                            <option value="stop">Stop Mixer</option>
                        </select>
                    </div>
                    <div class="mb-3" id="mixerSpeedContainer">
                        <label class="form-label">Speed (0-255)</label>
                        <input type="number" id="mixerSpeed" class="form-control" value="100" min="0" max="255">
                    </div>
                `;
                break;
                
            case 'water':
                html = `
                    <div class="mb-3">
                        <label class="form-label">Action</label>
                        <select id="waterAction" class="form-select">
                            <option value="dispense">Dispense Water</option>
                            <option value="settemp">Set Temperature</option>
                            <option value="stop">Stop Water</option>
                        </select>
                    </div>
                    <div class="mb-3" id="waterAmountContainer">
                        <label class="form-label">Amount (g)</label>
                        <input type="number" id="waterAmount" class="form-control" value="100">
                    </div>
                    <div class="mb-3" id="waterTempContainer" style="display:none;">
                        <label class="form-label">Temperature (°C)</label>
                        <input type="number" id="waterTemp" class="form-control" value="35">
                    </div>
                `;
                break;
                
            case 'scale':
                html = `
                    <div class="mb-3">
                        <label class="form-label">Action</label>
                        <select id="scaleAction" class="form-select">
                            <option value="tare">Tare Absolute</option>
                            <option value="tarerelative">Tare Relative</option>
                        </select>
                    </div>
                `;
                break;
                
            case 'motor':
                html = `
                    <div class="mb-3">
                        <label class="form-label">Action</label>
                        <select id="motorAction" class="form-select">
                            <option value="enabledrivers">Enable Drivers</option>
                            <option value="disabledrivers">Disable Drivers</option>
                        </select>
                    </div>
                `;
                break;
        }
        
        container.innerHTML = html;
        
        // Add additional event listeners for dynamic fields
        if (commandType === 'mixer') {
            const mixerAction = document.getElementById('mixerAction');
            const mixerSpeedContainer = document.getElementById('mixerSpeedContainer');
            
            mixerAction.addEventListener('change', () => {
                mixerSpeedContainer.style.display = mixerAction.value === 'speed' ? 'block' : 'none';
            });
        }
        
        if (commandType === 'water') {
            const waterAction = document.getElementById('waterAction');
            const waterAmountContainer = document.getElementById('waterAmountContainer');
            const waterTempContainer = document.getElementById('waterTempContainer');
            
            waterAction.addEventListener('change', () => {
                waterAmountContainer.style.display = waterAction.value === 'dispense' ? 'block' : 'none';
                waterTempContainer.style.display = waterAction.value === 'settemp' ? 'block' : 'none';
            });
        }
    },
    
    // Build a command string based on the selected type and parameters
    buildCommand: function(commandType) {
        let command = '';
        
        switch (commandType) {
            case 'feeder':
                const feederNumber = document.getElementById('feederNumber').value;
                const feederAmount = document.getElementById('feederAmount').value;
                command = `feeder${feederNumber}+${feederAmount}`;
                break;
                
            case 'mixer':
                const mixerAction = document.getElementById('mixerAction').value;
                if (mixerAction === 'speed') {
                    const mixerSpeed = document.getElementById('mixerSpeed').value;
                    command = `mixerspeed+${mixerSpeed}`;
                } else {
                    command = 'mixerstop';
                }
                break;
                
            case 'water':
                const waterAction = document.getElementById('waterAction').value;
                if (waterAction === 'dispense') {
                    const waterAmount = document.getElementById('waterAmount').value;
                    command = `water+${waterAmount}`;
                } else if (waterAction === 'settemp') {
                    const waterTemp = document.getElementById('waterTemp').value;
                    command = `settemp+${waterTemp}`;
                } else {
                    command = 'stopwater';
                }
                break;
                
            case 'scale':
                command = document.getElementById('scaleAction').value;
                break;
                
            case 'motor':
                command = document.getElementById('motorAction').value;
                break;
        }
        
        return command;
    },
    
    // Render the list of commands
    renderCommandsList: function() {
        const container = document.getElementById('batchCommandsList');
        container.innerHTML = '';
        
        if (this.commands.length === 0) {
            container.innerHTML = '<div class="alert alert-secondary">No commands added yet.</div>';
            return;
        }
        
        this.commands.forEach((command, index) => {
            const commandItem = document.createElement('div');
            commandItem.className = 'd-flex justify-content-between align-items-center p-2 mb-1 border rounded';
            
            // Command number and text
            const commandText = document.createElement('div');
            commandText.innerHTML = `<strong>${index + 1}.</strong> ${command}`;
            
            // Move up/down buttons
            const buttonsContainer = document.createElement('div');
            
            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-outline-danger ms-2';
            deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
            deleteBtn.title = 'Remove Command';
            deleteBtn.addEventListener('click', () => this.removeCommand(index));
            
            // Add all buttons
            buttonsContainer.appendChild(deleteBtn);
            
            // Add to command item
            commandItem.appendChild(commandText);
            commandItem.appendChild(buttonsContainer);
            
            // Add to container
            container.appendChild(commandItem);
        });
    },
    
    // Remove a command from the batch
    removeCommand: function(index) {
        this.commands.splice(index, 1);
        this.renderCommandsList();
    },
    
    // Execute the batch of commands
    executeBatch: function() {
        if (this.commands.length === 0) {
            addLogEntry('No commands to execute', 'error');
            return;
        }
        
        if (!isConnected) {
            addLogEntry('Please connect to the device first', 'error');
            return;
        }
        
        const delay = document.getElementById('batchDelay').value;
        
        fetch('/api/batch/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                commands: this.commands,
                delay: parseInt(delay)
            })
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
                addLogEntry(`Failed to execute batch: ${error.message}`, 'error');
            });
    },
    
    // Clear all commands
    clearCommands: function() {
        if (confirm('Are you sure you want to clear all commands?')) {
            this.commands = [];
            this.renderCommandsList();
        }
    }
};

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if the batch tab exists
    if (document.getElementById('batch-tab')) {
        BatchProcessor.init();
    }
}); 