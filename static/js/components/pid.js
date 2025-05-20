// PID Tuning Component
const PIDTuner = {
    // PID default values
    currentValues: {
        p: 10,
        i: 0.2,
        d: 0.1
    },
    
    // Chart data for PID response visualization
    responseData: {
        setpoint: [],
        process: [],
        control: []
    },
    
    // Initialize the PID tuner
    init: function() {
        // Add event listeners
        document.getElementById('applyPIDBtn').addEventListener('click', this.applyPIDSettings.bind(this));
        document.getElementById('savePIDProfileBtn').addEventListener('click', this.savePIDProfile.bind(this));
        document.getElementById('refreshPIDProfilesBtn').addEventListener('click', this.loadPIDProfiles.bind(this));
        
        // Load existing PID profiles
        this.loadPIDProfiles();
        
        // Initialize PID response chart
        this.initResponseChart();
    },
    
    // Initialize the PID response visualization chart
    initResponseChart: function() {
        const ctx = document.getElementById('pidResponseChart').getContext('2d');
        
        // Generate test data for initial chart
        this.generateTestData();
        
        this.responseChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: Array(100).fill(''),
                datasets: [
                    {
                        label: 'Setpoint',
                        data: this.responseData.setpoint,
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 2,
                        fill: false
                    },
                    {
                        label: 'Process Variable',
                        data: this.responseData.process,
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 2,
                        fill: false
                    },
                    {
                        label: 'Control Output',
                        data: this.responseData.control,
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 2,
                        fill: false
                    }
                ]
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
    },
    
    // Generate test data for PID response visualization
    generateTestData: function() {
        const p = parseFloat(document.getElementById('pidPValue').value);
        const i = parseFloat(document.getElementById('pidIValue').value);
        const d = parseFloat(document.getElementById('pidDValue').value);
        
        // Reset data arrays
        this.responseData.setpoint = Array(100).fill(100);
        this.responseData.process = [];
        this.responseData.control = [];
        
        // Simple PID simulation
        let process = 0;
        let integral = 0;
        let lastError = 0;
        
        for (let t = 0; t < 100; t++) {
            const setpoint = 100;
            const error = setpoint - process;
            
            integral += error;
            const derivative = error - lastError;
            
            let control = p * error + i * integral + d * derivative;
            control = Math.min(255, Math.max(0, control)); // Clamp control to 0-255
            
            // Simple first-order process model
            process += 0.1 * control - 0.05 * process;
            
            this.responseData.process.push(process);
            this.responseData.control.push(control);
            
            lastError = error;
        }
    },
    
    // Apply PID settings to the controller
    applyPIDSettings: function() {
        const p = document.getElementById('pidPValue').value;
        const i = document.getElementById('pidIValue').value;
        const d = document.getElementById('pidDValue').value;
        
        if (!p || !i || !d) {
            addLogEntry('Please enter valid PID values', 'error');
            return;
        }
        
        if (!isConnected) {
            addLogEntry('Please connect to the device first', 'error');
            return;
        }
        
        const settings = {
            p: parseFloat(p),
            i: parseFloat(i),
            d: parseFloat(d)
        };
        
        fetch('/api/pid/apply', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    addLogEntry(data.message, 'system');
                    
                    // Update current values
                    this.currentValues = { ...settings };
                    
                    // Update visualization
                    this.generateTestData();
                    this.updateResponseChart();
                } else {
                    addLogEntry(data.error, 'error');
                }
            })
            .catch(error => {
                addLogEntry(`Failed to apply PID settings: ${error.message}`, 'error');
            });
    },
    
    // Update the PID response chart
    updateResponseChart: function() {
        this.responseChart.data.datasets[0].data = this.responseData.setpoint;
        this.responseChart.data.datasets[1].data = this.responseData.process;
        this.responseChart.data.datasets[2].data = this.responseData.control;
        this.responseChart.update();
    },
    
    // Save the current PID profile
    savePIDProfile: function() {
        const name = document.getElementById('pidProfileName').value;
        
        if (!name) {
            addLogEntry('Please enter a profile name', 'error');
            return;
        }
        
        const p = parseFloat(document.getElementById('pidPValue').value);
        const i = parseFloat(document.getElementById('pidIValue').value);
        const d = parseFloat(document.getElementById('pidDValue').value);
        
        if (isNaN(p) || isNaN(i) || isNaN(d)) {
            addLogEntry('Please enter valid PID values', 'error');
            return;
        }
        
        const profile = {
            name: name,
            p: p,
            i: i,
            d: d
        };
        
        fetch('/api/pid/profiles', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(profile)
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    addLogEntry(data.message, 'system');
                    document.getElementById('pidProfileName').value = '';
                    this.loadPIDProfiles();
                } else {
                    addLogEntry(data.error, 'error');
                }
            })
            .catch(error => {
                addLogEntry(`Failed to save PID profile: ${error.message}`, 'error');
            });
    },
    
    // Load saved PID profiles from the server
    loadPIDProfiles: function() {
        fetch('/api/pid/profiles')
            .then(response => response.json())
            .then(profiles => {
                const tbody = document.getElementById('pidProfilesTable');
                tbody.innerHTML = '';
                
                profiles.forEach(profile => {
                    const row = document.createElement('tr');
                    
                    // Name column
                    const nameCell = document.createElement('td');
                    nameCell.textContent = profile.name;
                    
                    // P column
                    const pCell = document.createElement('td');
                    pCell.textContent = profile.p;
                    
                    // I column
                    const iCell = document.createElement('td');
                    iCell.textContent = profile.i;
                    
                    // D column
                    const dCell = document.createElement('td');
                    dCell.textContent = profile.d;
                    
                    // Actions column
                    const actionsCell = document.createElement('td');
                    
                    const loadBtn = document.createElement('button');
                    loadBtn.className = 'btn btn-sm btn-primary me-1';
                    loadBtn.innerHTML = '<i class="bi bi-upload"></i>';
                    loadBtn.title = 'Load Profile';
                    loadBtn.addEventListener('click', () => this.loadPIDProfile(profile));
                    
                    const deleteBtn = document.createElement('button');
                    deleteBtn.className = 'btn btn-sm btn-danger';
                    deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
                    deleteBtn.title = 'Delete Profile';
                    deleteBtn.addEventListener('click', () => this.deletePIDProfile(profile.filename));
                    
                    actionsCell.appendChild(loadBtn);
                    actionsCell.appendChild(deleteBtn);
                    
                    row.appendChild(nameCell);
                    row.appendChild(pCell);
                    row.appendChild(iCell);
                    row.appendChild(dCell);
                    row.appendChild(actionsCell);
                    
                    tbody.appendChild(row);
                });
            })
            .catch(error => {
                addLogEntry(`Failed to load PID profiles: ${error.message}`, 'error');
            });
    },
    
    // Load a PID profile into the form
    loadPIDProfile: function(profile) {
        document.getElementById('pidPValue').value = profile.p;
        document.getElementById('pidIValue').value = profile.i;
        document.getElementById('pidDValue').value = profile.d;
        
        // Update visualization
        this.generateTestData();
        this.updateResponseChart();
        
        addLogEntry(`Loaded PID profile: ${profile.name}`, 'system');
    },
    
    // Delete a PID profile
    deletePIDProfile: function(filename) {
        if (confirm('Are you sure you want to delete this PID profile?')) {
            fetch(`/api/pid/profiles/${filename}`, {
                method: 'DELETE'
            })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        addLogEntry(data.message, 'system');
                        this.loadPIDProfiles();
                    } else {
                        addLogEntry(data.error, 'error');
                    }
                })
                .catch(error => {
                    addLogEntry(`Failed to delete PID profile: ${error.message}`, 'error');
                });
        }
    }
};

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    PIDTuner.init();
}); 