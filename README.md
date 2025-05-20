# Teigwunderbar Machine Controller (Enhanced Version)

A comprehensive web-based control interface for the Teigwunderbar Machine ESP32 Controller with advanced features.

## Overview

This application provides a full-featured web interface to control, monitor, and manage the Teigwunderbar Machine. It connects to the ESP32 controller via serial communication and offers:

- Real-time weight and temperature monitoring with interactive charts
- Complete control of all 7 feeders, mixer, and water systems
- Recipe management system for storing and executing custom recipes
- PID tuning interface with visual feedback and profile management
- Data logging and export in multiple formats
- Batch processing capabilities
- Machine visualization with animated components
- Comprehensive system testing tools
- Calibration utilities
- Multi-language support (currently English and German)

## Requirements

- Python 3.6 or higher
- Flask
- PySerial
- Web browser with JavaScript enabled
- ESP32 running the Teigwunderbar Machine firmware

## Installation

1. Clone this repository or download the files
2. Install required Python packages:
   ```
   pip install flask pyserial
   ```
3. Create necessary data directories (or run the app once to create them automatically):
   ```
   mkdir -p static/data/recipes static/data/logs static/data/calibration static/data/pid_profiles
   ```

## Usage

1. Connect your ESP32 controller to your computer via USB
2. Run the Flask application:
   ```
   python app.py
   ```
3. Open a web browser and navigate to:
   ```
   http://localhost:5000
   ```
4. In the connection panel, select the correct COM port and click "Connect"
5. Once connected, you can use the various tabs to control the machine

## Features

### Basic Control
- Monitor weight, temperature, and mixer speed in real-time
- Control all 7 feeders with precise target weights
- Adjust mixer speed and utilize PID control
- Control water temperature and dispensing
- Tare scale (absolute or relative)
- Enable/disable motor drivers

### Recipe Management
- Create, save, and manage recipes
- Add ingredients with specified feeders and amounts
- Define multi-step processes
- Execute complete recipes automatically

### PID Tuning
- Adjust and apply PID parameters (Kp, Ki, Kd)
- Visualize PID response with interactive chart
- Save and load PID profiles for different materials

### Data Logging
- Record all sensor data with timestamps
- Export data in JSON or CSV formats
- Review and download previous sessions

### Batch Processing
- Queue multiple commands for sequential execution
- Set delays between operations
- Execute complex sequences automatically

### Machine Visualization
- Interactive animated diagram showing all machine components
- Real-time status indicators for feeders, mixer, and water system
- Visual feedback on active components

### Calibration Tools
- Load cell calibration utilities
- Temperature sensor calibration
- Motor speed calibration

### System Testing
- Component testing for feeders, mixer, water system, and scale
- Diagnostic feedback for troubleshooting
- Self-test functionality

### Multi-language Support
- Switch between available languages
- Currently supports English and German
- Extensible for additional languages

## System Commands

The application supports all commands from the original ESP32 firmware:

### Feeder Commands
- `feeder1+300` - Start feeder 1 to dispense 300g
- `feeder2+500` - Start feeder 2 to dispense 500g
- (and similar for feeders 3-7)

### Mixer Commands
- `mixerspeed+200` - Set mixer speed to 200 (range 0-255)
- `mixerstop` - Stop the mixer
- `wheat+500` - Start PID-controlled wheat filling to 500g
- `wheatstop` - Stop PID control

### Water Commands
- `water+300` - Dispense 300g of water
- `settemp+35` - Set target water temperature to 35°C
- `stopwater` - Stop water system
- `heatwater` - Turn on water heater
- `heatwateroff` - Turn off water heater

### Scale Commands
- `tare` - Tare the scale (absolute reset)
- `tarerelative` - Tare only the relative weight

### Motor Control
- `enabledrivers` - Enable all stepper motor drivers
- `disabledrivers` - Disable all stepper motor drivers

### PID Tuning
- `tunepid+10,0.2,0.1` - Set PID parameters (P=10, I=0.2, D=0.1)

## File Structure

```
/
├── app.py                    # Main Flask application
├── templates/
│   └── index.html            # Main HTML interface
├── static/
│   ├── css/
│   │   ├── style.css         # Main styles
│   │   └── themes/           # Theme variations
│   ├── js/
│   │   ├── app.js            # Main application logic
│   │   ├── i18n.js           # Internationalization support
│   │   └── components/       # Component-specific JS
│   │       ├── recipes.js    # Recipe management
│   │       └── pid.js        # PID tuning
│   ├── data/
│   │   ├── recipes/          # Saved recipes (JSON)
│   │   ├── logs/             # Data logs (JSON/CSV)
│   │   ├── calibration/      # Calibration data
│   │   └── pid_profiles/     # Saved PID profiles
│   ├── images/
│   │   └── machine.svg       # Machine visualization
│   └── locales/
│       ├── en.json           # English translations
│       └── de.json           # German translations
```

## Troubleshooting

If you encounter connection issues:
1. Make sure the ESP32 is properly connected and powered
2. Verify the correct COM port is selected
3. Check that the baud rate in the ESP32 code is set to 115200
4. Restart the application and/or refresh the page

If data visualization doesn't work:
1. Check if your browser supports SVG animations
2. Make sure JavaScript is enabled
3. Check the browser console for any errors

## Extending the Application

### Adding New Languages
1. Create a new JSON file in `static/locales/` (e.g., `fr.json`)
2. Copy the structure from an existing language file
3. Translate all text values
4. The new language will be automatically detected and available in the language dropdown

### Adding New Features
1. Backend: Add new routes to `app.py`
2. Frontend: Create component JS in `static/js/components/`
3. UI: Add new tab or controls to `templates/index.html`

## License

This project is available under the MIT License.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. 