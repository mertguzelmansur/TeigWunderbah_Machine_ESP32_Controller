// Machine Visualization Component
const MachineVisualization = {
    // SVG elements
    svg: null,
    mixerBlades: null,
    mixerStatus: null,
    waterStatus: null,
    heaterStatus: null,
    feeders: null,
    weightDisplay: null,
    tempDisplay: null,
    mixerSpeedDisplay: null,
    
    // Animation properties
    mixerRotation: 0,
    animationId: null,
    
    // Initialize the machine visualization
    init: function() {
        // Load the SVG into the visualization tab
        this.loadSvg();
        
        // Add tab change event listener to start/stop visualization
        const visualizationTab = document.getElementById('visualization-tab');
        if (visualizationTab) {
            visualizationTab.addEventListener('shown.bs.tab', () => {
                if (isConnected) {
                    this.startAnimation();
                }
            });
            
            visualizationTab.addEventListener('hidden.bs.tab', () => {
                this.stopAnimation();
            });
        }
    },
    
    // Load the SVG content
    loadSvg: function() {
        const container = document.getElementById('machineVisContainer');
        if (!container) return;
        
        fetch('/static/images/machine.svg')
            .then(response => response.text())
            .then(svgData => {
                container.innerHTML = svgData;
                this.svg = container.querySelector('svg');
                this.setupAnimation();
                
                // If connected, start the animation
                if (isConnected) {
                    this.startAnimation();
                }
            })
            .catch(error => {
                console.error('Failed to load machine visualization:', error);
                container.innerHTML = `<div class="alert alert-danger">Failed to load machine visualization: ${error.message}</div>`;
            });
    },
    
    // Set up animation elements
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
        
        // Add interactivity to machine components
        this.addInteractivity();
    },
    
    // Add interactive tooltips and click events to machine components
    addInteractivity: function() {
        // Make feeders clickable with tooltips
        this.feeders.forEach(feeder => {
            const feederNum = feeder.getAttribute('data-feeder');
            
            // Add hover effect
            feeder.style.cursor = 'pointer';
            
            // Add click event
            feeder.addEventListener('click', () => {
                if (isConnected) {
                    // When a feeder is clicked, update the feeder control in the main UI
                    const feederSelect = document.getElementById('feederSelect');
                    if (feederSelect) {
                        feederSelect.value = feederNum;
                        
                        // Flash the control panel to draw attention
                        const feederCard = feederSelect.closest('.card');
                        if (feederCard) {
                            feederCard.classList.add('highlight-card');
                            setTimeout(() => {
                                feederCard.classList.remove('highlight-card');
                            }, 1000);
                        }
                    }
                    
                    // Switch to control tab
                    const controlTab = document.getElementById('control-tab');
                    if (controlTab) {
                        bootstrap.Tab.getOrCreateInstance(controlTab).show();
                    }
                }
            });
            
            // Add tooltip
            this.addTooltip(feeder, `Feeder ${feederNum}`);
        });
        
        // Make mixer clickable
        const mixer = this.svg.getElementById('mixer');
        if (mixer) {
            mixer.style.cursor = 'pointer';
            mixer.addEventListener('click', () => {
                if (isConnected) {
                    // Switch to control tab and highlight mixer controls
                    const controlTab = document.getElementById('control-tab');
                    if (controlTab) {
                        bootstrap.Tab.getOrCreateInstance(controlTab).show();
                        
                        // Flash the mixer control panel
                        const mixerCard = document.getElementById('mixerSpeedSlider').closest('.card');
                        if (mixerCard) {
                            mixerCard.classList.add('highlight-card');
                            setTimeout(() => {
                                mixerCard.classList.remove('highlight-card');
                            }, 1000);
                        }
                    }
                }
            });
            
            // Add tooltip
            this.addTooltip(mixer, 'Mixer Controls');
        }
        
        // Make water system clickable
        const waterSystem = this.svg.getElementById('waterSystem');
        if (waterSystem) {
            waterSystem.style.cursor = 'pointer';
            waterSystem.addEventListener('click', () => {
                if (isConnected) {
                    // Switch to control tab and highlight water controls
                    const controlTab = document.getElementById('control-tab');
                    if (controlTab) {
                        bootstrap.Tab.getOrCreateInstance(controlTab).show();
                        
                        // Flash the water control panel
                        const waterCard = document.getElementById('waterAmount').closest('.card');
                        if (waterCard) {
                            waterCard.classList.add('highlight-card');
                            setTimeout(() => {
                                waterCard.classList.remove('highlight-card');
                            }, 1000);
                        }
                    }
                }
            });
            
            // Add tooltip
            this.addTooltip(waterSystem, 'Water System Controls');
        }
        
        // Make scale clickable
        const scale = this.svg.getElementById('scale');
        if (scale) {
            scale.style.cursor = 'pointer';
            scale.addEventListener('click', () => {
                if (isConnected) {
                    // Switch to control tab and highlight scale controls
                    const controlTab = document.getElementById('control-tab');
                    if (controlTab) {
                        bootstrap.Tab.getOrCreateInstance(controlTab).show();
                        
                        // Flash the scale control panel
                        const scaleCard = document.getElementById('tareBtn').closest('.card');
                        if (scaleCard) {
                            scaleCard.classList.add('highlight-card');
                            setTimeout(() => {
                                scaleCard.classList.remove('highlight-card');
                            }, 1000);
                        }
                    }
                }
            });
            
            // Add tooltip
            this.addTooltip(scale, 'Scale Controls');
        }
    },
    
    // Add a tooltip to an SVG element
    addTooltip: function(element, text) {
        // This is a simple implementation. In a real app, you might use a library like tippy.js
        element.setAttribute('title', text);
        
        // Use native bootstrap tooltips if available
        if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
            new bootstrap.Tooltip(element);
        }
    },
    
    // Start the animation loop
    startAnimation: function() {
        if (this.animationId) return; // Already running
        
        const animate = () => {
            this.animationId = requestAnimationFrame(animate);
            this.updateVisualization();
        };
        
        animate();
    },
    
    // Stop the animation loop
    stopAnimation: function() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    },
    
    // Update the visualization based on current data
    updateVisualization: function() {
        if (!this.svg || !this.mixerBlades) return;
        
        // Get latest data
        const latestData = window.latest_data || {
            weight: 0,
            temperature: 0,
            relativeWeight: 0,
            mixerSpeed: 0,
            activeFeeder: null
        };
        
        // Update mixer rotation based on mixer speed
        if (isConnected && latestData.mixerSpeed > 0) {
            this.mixerRotation += latestData.mixerSpeed / 255 * 5;
            this.mixerBlades.setAttribute('transform', `rotate(${this.mixerRotation}, 400, 350)`);
            this.mixerStatus.setAttribute('fill', '#28a745'); // Green when running
        } else {
            this.mixerStatus.setAttribute('fill', '#ccc'); // Gray when stopped
        }
        
        // Update feeder indicators based on active feeder
        this.feeders.forEach(feeder => {
            const feederNum = parseInt(feeder.getAttribute('data-feeder'));
            const isActive = isConnected && latestData.activeFeeder === feederNum;
            
            if (isActive) {
                feeder.querySelector('rect').setAttribute('fill', '#a8d5e5');
                feeder.querySelector('circle').setAttribute('fill', '#28a745');
                
                // Add a dropping animation for active feeders
                this.animateFeederDrop(feeder);
            } else {
                feeder.querySelector('rect').setAttribute('fill', '#ddd');
                feeder.querySelector('circle').setAttribute('fill', '#999');
            }
        });
        
        // Update water system
        // In a real app, we'd have water system status in latestData
        const waterSystemActive = false; // Placeholder
        if (waterSystemActive) {
            this.waterStatus.setAttribute('fill', '#28a745'); // Green when active
            
            // Add water droplet animation
            this.animateWaterDrop();
        } else {
            this.waterStatus.setAttribute('fill', '#ccc'); // Gray when inactive
        }
        
        // Update heater status
        // In a real app, we'd have heater status in latestData
        const heaterActive = false; // Placeholder
        if (heaterActive) {
            this.heaterStatus.setAttribute('fill', '#dc3545'); // Red when heating
        } else {
            this.heaterStatus.setAttribute('fill', '#ccc'); // Gray when inactive
        }
        
        // Update readings display
        if (this.weightDisplay) {
            this.weightDisplay.textContent = `Weight: ${latestData.weight.toFixed(1)}g`;
        }
        if (this.tempDisplay) {
            this.tempDisplay.textContent = `Temp: ${latestData.temperature.toFixed(1)}°C`;
        }
        if (this.mixerSpeedDisplay) {
            this.mixerSpeedDisplay.textContent = `Mixer: ${latestData.mixerSpeed}/255`;
        }
    },
    
    // Animate feeder dropping material
    animateFeederDrop: function(feeder) {
        // This is called repeatedly during animation, so we need to limit how often we create particles
        if (Math.random() > 0.1) return; // Only create particles occasionally
        
        const feederCircle = feeder.querySelector('circle');
        if (!feederCircle) return;
        
        // Get position of feeder outlet
        const x = parseFloat(feederCircle.getAttribute('cx'));
        const y = parseFloat(feederCircle.getAttribute('cy'));
        
        // Create a particle
        const particle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        particle.setAttribute('cx', x);
        particle.setAttribute('cy', y);
        particle.setAttribute('r', 3);
        particle.setAttribute('fill', '#f0c850'); // Yellow/brown for ingredient
        
        // Add to SVG
        this.svg.appendChild(particle);
        
        // Animate the particle falling
        let currentY = y;
        let opacity = 1;
        
        const animateParticle = () => {
            currentY += 5;
            opacity -= 0.05;
            
            particle.setAttribute('cy', currentY);
            particle.setAttribute('opacity', opacity);
            
            if (currentY < 350 && opacity > 0) {
                requestAnimationFrame(animateParticle);
            } else {
                // Remove particle when animation is done
                particle.remove();
            }
        };
        
        animateParticle();
    },
    
    // Animate water droplet
    animateWaterDrop: function() {
        // This is called repeatedly during animation, so we need to limit how often we create droplets
        if (Math.random() > 0.1) return; // Only create droplets occasionally
        
        // Get position of water outlet
        const x = 640;
        const y = 340;
        
        // Create a droplet
        const droplet = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        droplet.setAttribute('cx', x);
        droplet.setAttribute('cy', y);
        droplet.setAttribute('r', 4);
        droplet.setAttribute('fill', '#8ec3d9'); // Blue for water
        
        // Add to SVG
        this.svg.appendChild(droplet);
        
        // Animate the droplet falling
        let currentY = y;
        let opacity = 1;
        
        const animateDroplet = () => {
            currentY += 8;
            opacity -= 0.05;
            
            droplet.setAttribute('cy', currentY);
            droplet.setAttribute('opacity', opacity);
            
            if (currentY < 350 && opacity > 0) {
                requestAnimationFrame(animateDroplet);
            } else {
                // Remove droplet when animation is done
                droplet.remove();
            }
        };
        
        animateDroplet();
    }
};

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if the visualization tab exists
    if (document.getElementById('visualization-tab')) {
        MachineVisualization.init();
    }
}); 