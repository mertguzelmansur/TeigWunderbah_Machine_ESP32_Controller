import serial
import serial.tools.list_ports
import time
import threading
import json
import os
import csv
import datetime
from flask import Flask, jsonify, render_template, request, Response, send_file, redirect, url_for
from werkzeug.utils import secure_filename

app = Flask(__name__)

# Configuration
app.config['UPLOAD_FOLDER'] = 'static/data/recipes'
app.config['LOGS_FOLDER'] = 'static/data/logs'
app.config['CALIBRATION_FOLDER'] = 'static/data/calibration'
app.config['PID_PROFILES_FOLDER'] = 'static/data/pid_profiles'
app.config['ALLOWED_EXTENSIONS'] = {'json', 'csv'}
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max upload size

# Ensure directories exist
for folder in [app.config['UPLOAD_FOLDER'], app.config['LOGS_FOLDER'], 
               app.config['CALIBRATION_FOLDER'], app.config['PID_PROFILES_FOLDER']]:
    os.makedirs(folder, exist_ok=True)

# Global variables
ser = None
connected = False
data_lock = threading.Lock()
latest_data = {
    'weight': 0.0,
    'temperature': 0.0,
    'relativeWeight': 0.0,
    'mixerSpeed': 0,
    'pidEnabled': False,
    'activeFeeder': None
}

# Session data for logging
session_data = []
logging_active = False
current_session_id = None

# Thread for reading serial data
def read_serial_data():
    global ser, connected, latest_data, session_data, logging_active
    
    while connected:
        try:
            if ser and ser.in_waiting > 0:
                line = ser.readline().decode('utf-8').strip()
                
                # Parse the data based on prefixes
                if line.startswith("Weight:"):
                    weight_value = float(line.split(':')[1])
                    with data_lock:
                        latest_data['weight'] = weight_value
                        
                    # Log data if logging is active
                    if logging_active:
                        timestamp = datetime.datetime.now().isoformat()
                        log_entry = {
                            'timestamp': timestamp,
                            'weight': weight_value,
                            'temperature': latest_data['temperature'],
                            'relativeWeight': latest_data['relativeWeight'],
                            'mixerSpeed': latest_data['mixerSpeed']
                        }
                        session_data.append(log_entry)
                        
                elif line.startswith("Temperature:"):
                    with data_lock:
                        latest_data['temperature'] = float(line.split(':')[1])
                elif line.startswith("RelativeWeight:"):
                    with data_lock:
                        latest_data['relativeWeight'] = float(line.split(':')[1])
                elif line.startswith("MixerSpeed:"):
                    with data_lock:
                        latest_data['mixerSpeed'] = int(line.split(':')[1])
                elif line.startswith("PID (SP,IN,OUT):"):
                    # Extract PID data if available
                    with data_lock:
                        latest_data['pidEnabled'] = True
                else:
                    # Check for feeder status
                    if "Feeder" in line and "started" in line.lower():
                        try:
                            feeder_num = int(line.split("Feeder ")[1].split(" ")[0])
                            with data_lock:
                                latest_data['activeFeeder'] = feeder_num
                        except:
                            pass
                    elif "Feeder" in line and "stopped" in line.lower():
                        with data_lock:
                            latest_data['activeFeeder'] = None
                            
                    # Logging other messages
                    print(f"ESP32: {line}")
                
        except Exception as e:
            print(f"Error reading serial data: {e}")
            time.sleep(0.1)
        
        time.sleep(0.01)  # Small delay to prevent CPU hogging

# Helper functions
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in app.config['ALLOWED_EXTENSIONS']

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/ports')
def get_ports():
    ports = [port.device for port in serial.tools.list_ports.comports()]
    return jsonify(ports)

@app.route('/api/connect', methods=['POST'])
def connect():
    global ser, connected, current_session_id
    
    port = request.json.get('port')
    if not port:
        return jsonify({"error": "No port specified"}), 400
    
    try:
        # Close existing connection if any
        if ser:
            connected = False
            ser.close()
            
        # Connect to new port
        ser = serial.Serial(port, 115200, timeout=1)
        connected = True
        
        # Create a new session ID for logging
        current_session_id = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        
        # Start the reading thread
        thread = threading.Thread(target=read_serial_data, daemon=True)
        thread.start()
        
        return jsonify({"success": True, "message": f"Connected to {port}", "session_id": current_session_id})
    except Exception as e:
        return jsonify({"error": f"Failed to connect: {str(e)}"}), 500

@app.route('/api/disconnect', methods=['POST'])
def disconnect():
    global ser, connected, logging_active
    
    # Stop logging if active
    if logging_active:
        stop_logging()
    
    if ser:
        connected = False
        ser.close()
        ser = None
        return jsonify({"success": True, "message": "Disconnected"})
    else:
        return jsonify({"error": "Not connected"}), 400

@app.route('/api/data')
def get_data():
    with data_lock:
        return jsonify(latest_data)

@app.route('/api/command', methods=['POST'])
def send_command():
    command = request.json.get('command')
    if not command:
        return jsonify({"error": "No command specified"}), 400
    
    if not ser or not connected:
        return jsonify({"error": "Not connected to device"}), 400
    
    try:
        ser.write(f"{command}\n".encode('utf-8'))
        return jsonify({"success": True, "message": f"Command sent: {command}"})
    except Exception as e:
        return jsonify({"error": f"Failed to send command: {str(e)}"}), 500

@app.route('/api/stream')
def stream():
    def generate():
        last_sent = {}
        while True:
            with data_lock:
                current_data = latest_data.copy()
            
            # Only send updates when data changes
            if current_data != last_sent:
                last_sent = current_data.copy()
                yield f"data: {json.dumps(current_data)}\n\n"
            
            time.sleep(0.1)
    
    return Response(generate(), mimetype='text/event-stream')

# Recipe Management
@app.route('/api/recipes', methods=['GET'])
def get_recipes():
    recipes = []
    recipe_dir = app.config['UPLOAD_FOLDER']
    
    if os.path.exists(recipe_dir):
        for filename in os.listdir(recipe_dir):
            if filename.endswith('.json'):
                file_path = os.path.join(recipe_dir, filename)
                try:
                    with open(file_path, 'r') as f:
                        recipe = json.load(f)
                        # Add filename to recipe data
                        recipe['filename'] = filename
                        recipes.append(recipe)
                except Exception as e:
                    print(f"Error reading recipe {filename}: {e}")
    
    return jsonify(recipes)

@app.route('/api/recipes', methods=['POST'])
def save_recipe():
    if not request.json:
        return jsonify({"error": "No recipe data provided"}), 400
    
    recipe_data = request.json
    
    # Ensure recipe has a name
    if 'name' not in recipe_data:
        return jsonify({"error": "Recipe must have a name"}), 400
    
    # Create a filename from the recipe name
    filename = secure_filename(recipe_data['name'] + '.json')
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
    
    try:
        with open(file_path, 'w') as f:
            json.dump(recipe_data, f, indent=2)
        return jsonify({"success": True, "message": f"Recipe saved as {filename}"})
    except Exception as e:
        return jsonify({"error": f"Failed to save recipe: {str(e)}"}), 500

@app.route('/api/recipes/<filename>', methods=['DELETE'])
def delete_recipe(filename):
    if not filename.endswith('.json'):
        filename += '.json'
    
    file_path = os.path.join(app.config['UPLOAD_FOLDER'], secure_filename(filename))
    
    if not os.path.exists(file_path):
        return jsonify({"error": "Recipe not found"}), 404
    
    try:
        os.remove(file_path)
        return jsonify({"success": True, "message": f"Recipe {filename} deleted"})
    except Exception as e:
        return jsonify({"error": f"Failed to delete recipe: {str(e)}"}), 500

# PID Tuning
@app.route('/api/pid/profiles', methods=['GET'])
def get_pid_profiles():
    profiles = []
    pid_dir = app.config['PID_PROFILES_FOLDER']
    
    if os.path.exists(pid_dir):
        for filename in os.listdir(pid_dir):
            if filename.endswith('.json'):
                file_path = os.path.join(pid_dir, filename)
                try:
                    with open(file_path, 'r') as f:
                        profile = json.load(f)
                        # Add filename to profile data
                        profile['filename'] = filename
                        profiles.append(profile)
                except Exception as e:
                    print(f"Error reading PID profile {filename}: {e}")
    
    return jsonify(profiles)

@app.route('/api/pid/profiles', methods=['POST'])
def save_pid_profile():
    if not request.json:
        return jsonify({"error": "No profile data provided"}), 400
    
    profile_data = request.json
    
    # Ensure profile has necessary data
    if not all(k in profile_data for k in ['name', 'p', 'i', 'd']):
        return jsonify({"error": "Profile must have name, p, i, and d values"}), 400
    
    # Create a filename from the profile name
    filename = secure_filename(profile_data['name'] + '.json')
    file_path = os.path.join(app.config['PID_PROFILES_FOLDER'], filename)
    
    try:
        with open(file_path, 'w') as f:
            json.dump(profile_data, f, indent=2)
        return jsonify({"success": True, "message": f"PID profile saved as {filename}"})
    except Exception as e:
        return jsonify({"error": f"Failed to save PID profile: {str(e)}"}), 500

@app.route('/api/pid/apply', methods=['POST'])
def apply_pid_settings():
    if not request.json:
        return jsonify({"error": "No PID settings provided"}), 400
    
    settings = request.json
    
    # Ensure settings have necessary data
    if not all(k in settings for k in ['p', 'i', 'd']):
        return jsonify({"error": "Settings must have p, i, and d values"}), 400
    
    # Construct tunepid command
    command = f"tunepid+{settings['p']},{settings['i']},{settings['d']}"
    
    try:
        if ser and connected:
            ser.write(f"{command}\n".encode('utf-8'))
            return jsonify({"success": True, "message": f"PID settings applied: {command}"})
        else:
            return jsonify({"error": "Not connected to device"}), 400
    except Exception as e:
        return jsonify({"error": f"Failed to apply PID settings: {str(e)}"}), 500

# Data Logging
@app.route('/api/logging/start', methods=['POST'])
def start_logging():
    global logging_active, session_data, current_session_id
    
    if not connected:
        return jsonify({"error": "Not connected to device"}), 400
    
    # Clear any existing session data
    session_data = []
    logging_active = True
    
    if not current_session_id:
        current_session_id = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    
    return jsonify({
        "success": True, 
        "message": "Data logging started",
        "session_id": current_session_id
    })

@app.route('/api/logging/stop', methods=['POST'])
def stop_logging():
    global logging_active, session_data, current_session_id
    
    if not logging_active:
        return jsonify({"error": "Logging is not active"}), 400
    
    logging_active = False
    
    # Save session data to file
    if session_data and current_session_id:
        try:
            # Ensure logs directory exists
            os.makedirs(app.config['LOGS_FOLDER'], exist_ok=True)
            
            # Save as JSON
            json_file = os.path.join(app.config['LOGS_FOLDER'], f"session_{current_session_id}.json")
            with open(json_file, 'w') as f:
                json.dump(session_data, f, indent=2)
            
            # Save as CSV
            csv_file = os.path.join(app.config['LOGS_FOLDER'], f"session_{current_session_id}.csv")
            with open(csv_file, 'w', newline='') as f:
                if session_data:
                    fieldnames = session_data[0].keys()
                    writer = csv.DictWriter(f, fieldnames=fieldnames)
                    writer.writeheader()
                    writer.writerows(session_data)
            
            return jsonify({
                "success": True, 
                "message": "Logging stopped and data saved",
                "session_id": current_session_id,
                "json_file": f"session_{current_session_id}.json",
                "csv_file": f"session_{current_session_id}.csv"
            })
        except Exception as e:
            return jsonify({"error": f"Failed to save log data: {str(e)}"}), 500
    else:
        return jsonify({"success": True, "message": "Logging stopped, no data to save"})

@app.route('/api/logging/sessions', methods=['GET'])
def get_sessions():
    sessions = []
    logs_dir = app.config['LOGS_FOLDER']
    
    if os.path.exists(logs_dir):
        for filename in os.listdir(logs_dir):
            if filename.endswith('.json') and filename.startswith('session_'):
                # Extract the session ID from the filename
                session_id = filename.replace('session_', '').replace('.json', '')
                
                # Get file creation time and size
                file_path = os.path.join(logs_dir, filename)
                creation_time = datetime.datetime.fromtimestamp(os.path.getctime(file_path))
                file_size = os.path.getsize(file_path)
                
                sessions.append({
                    'id': session_id,
                    'created': creation_time.isoformat(),
                    'size': file_size,
                    'filename': filename
                })
    
    # Sort sessions by creation time, newest first
    sessions.sort(key=lambda x: x['created'], reverse=True)
    return jsonify(sessions)

@app.route('/api/logging/download/<filename>')
def download_log(filename):
    file_path = os.path.join(app.config['LOGS_FOLDER'], secure_filename(filename))
    
    if not os.path.exists(file_path):
        return jsonify({"error": "Log file not found"}), 404
    
    return send_file(file_path, as_attachment=True)

# Calibration
@app.route('/api/calibration/save', methods=['POST'])
def save_calibration():
    if not request.json:
        return jsonify({"error": "No calibration data provided"}), 400
    
    calib_data = request.json
    
    # Create a timestamp for the calibration file
    timestamp = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    filename = f"calibration_{timestamp}.json"
    file_path = os.path.join(app.config['CALIBRATION_FOLDER'], filename)
    
    try:
        with open(file_path, 'w') as f:
            json.dump(calib_data, f, indent=2)
        return jsonify({"success": True, "message": f"Calibration saved as {filename}"})
    except Exception as e:
        return jsonify({"error": f"Failed to save calibration: {str(e)}"}), 500

# Batch Processing
@app.route('/api/batch/execute', methods=['POST'])
def execute_batch():
    if not request.json or 'commands' not in request.json:
        return jsonify({"error": "No batch commands provided"}), 400
    
    commands = request.json['commands']
    delay = request.json.get('delay', 0)  # Default delay between commands is 0
    
    if not connected or not ser:
        return jsonify({"error": "Not connected to device"}), 400
    
    try:
        # Start a thread to execute the batch commands
        def run_batch():
            for cmd in commands:
                try:
                    ser.write(f"{cmd}\n".encode('utf-8'))
                    print(f"Batch command sent: {cmd}")
                    time.sleep(delay)
                except Exception as e:
                    print(f"Error sending batch command: {e}")
        
        batch_thread = threading.Thread(target=run_batch)
        batch_thread.daemon = True
        batch_thread.start()
        
        return jsonify({
            "success": True, 
            "message": f"Executing batch of {len(commands)} commands with {delay}s delay"
        })
    except Exception as e:
        return jsonify({"error": f"Failed to start batch execution: {str(e)}"}), 500

# Language Support
@app.route('/api/locales', methods=['GET'])
def get_locales():
    locales = []
    locales_dir = 'static/locales'
    
    if os.path.exists(locales_dir):
        for filename in os.listdir(locales_dir):
            if filename.endswith('.json'):
                locale_code = filename.replace('.json', '')
                file_path = os.path.join(locales_dir, filename)
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        locale_data = json.load(f)
                        language_name = locale_data.get('language_name', locale_code)
                        locales.append({
                            'code': locale_code,
                            'name': language_name
                        })
                except Exception as e:
                    print(f"Error reading locale {filename}: {e}")
    
    return jsonify(locales)

# System Testing
@app.route('/api/system/test', methods=['POST'])
def run_system_test():
    if not request.json or 'test' not in request.json:
        return jsonify({"error": "No test specified"}), 400
    
    test_name = request.json['test']
    
    if not connected or not ser:
        return jsonify({"error": "Not connected to device"}), 400
    
    # Different test procedures
    test_procedures = {
        'feeders': ['feeder1+10', 'feeder2+10', 'feeder3+10', 'feeder4+10', 'feeder5+10', 'feeder6+10', 'feeder7+10'],
        'mixer': ['mixerspeed+50', 'mixerstop'],
        'water': ['settemp+30', 'watervalveon', 'watervalveoff'],
        'scale': ['tare']
    }
    
    if test_name not in test_procedures:
        return jsonify({"error": f"Unknown test: {test_name}"}), 400
    
    try:
        # Start a thread to execute the test commands
        def run_test():
            for cmd in test_procedures[test_name]:
                try:
                    ser.write(f"{cmd}\n".encode('utf-8'))
                    print(f"Test command sent: {cmd}")
                    time.sleep(1)  # Wait between test commands
                except Exception as e:
                    print(f"Error sending test command: {e}")
        
        test_thread = threading.Thread(target=run_test)
        test_thread.daemon = True
        test_thread.start()
        
        return jsonify({
            "success": True, 
            "message": f"Running {test_name} test"
        })
    except Exception as e:
        return jsonify({"error": f"Failed to start test: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0') 