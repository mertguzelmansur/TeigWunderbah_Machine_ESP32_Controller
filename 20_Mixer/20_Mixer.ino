//Teigwunderbar Machine ESP32 Controller 2025 

#include <Arduino.h>
#include "HX711.h"
#include "soc/rtc.h"
#include <AccelStepper.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <PID_v1_bc.h> // Changed from PID_v1.h to PID_v1_bc.h

// 50kg Load cell configuration
const int LOADCELL_DOUT_PIN = 16;
const int LOADCELL_SCK_PIN = 4;
HX711 scale;
float calibration_factor = -454.562; // adjust based on your calibration
float absolute_weight = 0.0;   // Total weight (never auto-tared) for Python interface
float relative_weight = 0.0;   // Weight used for feeder operations (can be tared)
float weight_offset = 0.0;     // Offset for calculating relative weight

// DS18B20 Temperature sensor
const int TEMP_SENSOR_PIN = 27;  // Pin for the DS18B20 sensor"
OneWire oneWire(TEMP_SENSOR_PIN);
DallasTemperature tempSensor(&oneWire);
float currentTemp = 0.0;  // Current temperature
float targetTemp = 35.0;  // Default target temperature in Celsius

// L298N Motor Driver pins for DC Mixer Motor
const int MIXER_ENA_PIN = 17;  // Enable A pin for PWM speed control
const int MIXER_IN1_PIN = 18;  // Input 1 for direction control
const int MIXER_IN2_PIN = 19;  // Input 2 for direction control
bool mixerRunning = false;
int mixerSpeed = 0;  // 0-255 for PWM control

// PID Control for wheat filling
double pidSetpoint = 0;      // Target weight
double pidInput = 0;         // Current weight
double pidOutput = 0;        // Motor speed (0-255)
// PID tuning parameters - adjust these based on your system
double Kp = 10;              // Proportional gain
double Ki = 0.2;             // Integral gain
double Kd = 0.1;             // Derivative gain
PID mixerPID(&pidInput, &pidOutput, &pidSetpoint, Kp, Ki, Kd, DIRECT);
bool pidEnabled = false;

// Water control pins
const int WATER_PUMP_PIN = 26;     // Water pump control
const int WATER_HEATER_PIN = 14;   // Water heater control (same as HEATER_RELAY_PIN)

// Water system states
bool waterHeaterActive = false;
bool waterPumpActive = false;
float targetWaterWeight = 0.0;
bool waterDispenseRequested = false;

// Stepper Motor pins - Feeders (Nema 17 with A4988)
#define MOTOR_INTERFACE_TYPE 0 // DRIVER interface (step pin only) for AccelStepper

// Feeder step pins
const int FEEDER1_STEP_PIN = 21;
const int FEEDER2_STEP_PIN = 25;
const int FEEDER3_STEP_PIN = 32;
const int FEEDER4_STEP_PIN = 35;
const int FEEDER5_STEP_PIN = 38;
const int FEEDER6_STEP_PIN = 41;
const int FEEDER7_STEP_PIN = 45;

// Enable pins (optional - can be disconnected if motors should always be enabled)
const int ENABLE_PIN = 23; // Single enable pin for all drivers if they're connected together

// Relay pins
const int MIXER_RELAY_PIN = 13;
const int HEATER_RELAY_PIN = 14;
const int WATER_VALVE_PIN = 15;

// Create stepper instances (direction control is hardwired)
AccelStepper feeder1(MOTOR_INTERFACE_TYPE, FEEDER1_STEP_PIN);
AccelStepper feeder2(MOTOR_INTERFACE_TYPE, FEEDER2_STEP_PIN);
AccelStepper feeder3(MOTOR_INTERFACE_TYPE, FEEDER3_STEP_PIN);
AccelStepper feeder4(MOTOR_INTERFACE_TYPE, FEEDER4_STEP_PIN);
AccelStepper feeder5(MOTOR_INTERFACE_TYPE, FEEDER5_STEP_PIN);
AccelStepper feeder6(MOTOR_INTERFACE_TYPE, FEEDER6_STEP_PIN);
AccelStepper feeder7(MOTOR_INTERFACE_TYPE, FEEDER7_STEP_PIN);

// Command processing
String inputString = "";
boolean stringComplete = false;

// Feeder operation variables
bool feeder_active[7] = {false, false, false, false, false, false, false};
float target_weights[7] = {0, 0, 0, 0, 0, 0, 0};
bool use_enable_pin = true; // Set to false if you're not using the enable pin

// Speed control parameters
const int MAX_SPEED = 1000;     // Maximum speed for feeders
const int MIN_SPEED = 100;      // Minimum speed when approaching target
const float SLOW_DOWN_THRESHOLD = 0.80; // Start slowing down at 80% of target
const float FINE_TUNE_THRESHOLD = 0.95; // Fine adjustment at 95% of target

// Timing variables
unsigned long lastTempCheck = 0;
const unsigned long TEMP_CHECK_INTERVAL = 1000; // Check temperature every 1 second
unsigned long lastPIDUpdate = 0;
const unsigned long PID_UPDATE_INTERVAL = 50; // Update PID 20 times per second

// Adding Python interface command constants for compatibility
#define CMD_START "START"
#define CMD_STOP "STOP"
#define CMD_CALIBRATE "CALIBRATE"
#define CMD_READ_WEIGHT "READ_WEIGHT"
#define CMD_TARE "TARE"
#define CMD_SET_SPEED "SET_SPEED"
#define CMD_PING "PING"

void setup() {
  Serial.begin(115200);
  
  // Setup scale
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  scale.set_scale(calibration_factor);
  scale.tare(); // Initial tare for both absolute and relative
  weight_offset = 0;
  
  // Setup temperature sensor
  tempSensor.begin();
  
  // Setup mixer motor control pins
  pinMode(MIXER_ENA_PIN, OUTPUT);
  pinMode(MIXER_IN1_PIN, OUTPUT);
  pinMode(MIXER_IN2_PIN, OUTPUT);
  analogWrite(MIXER_ENA_PIN, 0);    // Start with motor off
  digitalWrite(MIXER_IN1_PIN, LOW); // Set initial direction
  digitalWrite(MIXER_IN2_PIN, LOW); // Set initial direction
  
  // Configure PID
  mixerPID.SetMode(AUTOMATIC);
  mixerPID.SetOutputLimits(0, 255);  // PWM range
  mixerPID.SetSampleTime(50);        // 50ms
  
  // Setup stepper motors
  setupSteppers();
  
  // Setup relay pins
  pinMode(MIXER_RELAY_PIN, OUTPUT);
  pinMode(HEATER_RELAY_PIN, OUTPUT);
  pinMode(WATER_VALVE_PIN, OUTPUT);
  pinMode(WATER_PUMP_PIN, OUTPUT);
  
  // Set initial state for relays
  digitalWrite(MIXER_RELAY_PIN, LOW);
  digitalWrite(HEATER_RELAY_PIN, LOW);
  digitalWrite(WATER_VALVE_PIN, LOW);
  digitalWrite(WATER_PUMP_PIN, LOW);
  
  Serial.println("System initialized. Waiting for commands.");
}

void setupSteppers() {
  // Configure stepper motors
  feeder1.setMaxSpeed(MAX_SPEED);
  feeder1.setAcceleration(500);
  
  feeder2.setMaxSpeed(MAX_SPEED);
  feeder2.setAcceleration(500);
  
  feeder3.setMaxSpeed(MAX_SPEED);
  feeder3.setAcceleration(500);
  
  feeder4.setMaxSpeed(MAX_SPEED);
  feeder4.setAcceleration(500);
  
  feeder5.setMaxSpeed(MAX_SPEED);
  feeder5.setAcceleration(500);
  
  feeder6.setMaxSpeed(MAX_SPEED);
  feeder6.setAcceleration(500);
  
  feeder7.setMaxSpeed(MAX_SPEED);
  feeder7.setAcceleration(500);
  
  // Setup enable pin if used
  if (use_enable_pin) {
    pinMode(ENABLE_PIN, OUTPUT);
    digitalWrite(ENABLE_PIN, HIGH); // Disable motors initially (LOW=enable, HIGH=disable for A4988)
  }
}

void loop() {
  // Read current weight (both absolute and relative)
  updateWeights();
  
  // Check temperature periodically
  updateTemperature();
  
  // Update PID control if enabled
  updateMixerPID();
  
  // Send loadcell data continuously
  reportWeights();
  
  // Process serial commands
  if (stringComplete) {
    processCommand(inputString);
    inputString = "";
    stringComplete = false;
  }
  
  // Check if any feeders need to be stopped based on weight and adjust speed
  checkFeeders();
  
  // Check water system status
  checkWaterSystem();
  
  // Run all active steppers
  feeder1.run();
  feeder2.run();
  feeder3.run();
  feeder4.run();
  feeder5.run();
  feeder6.run();
  feeder7.run();
  
  // Read serial data
  while (Serial.available()) {
    char inChar = (char)Serial.read();
    inputString += inChar;
    if (inChar == '\n') {
      stringComplete = true;
    }
  }
}

void updateWeights() {
  // Read the raw value from scale
  absolute_weight = scale.get_units(5);
  
  // Calculate relative weight (for feeder operations)
  relative_weight = absolute_weight - weight_offset;
  
  // Update PID input with current weight if PID is enabled
  if (pidEnabled) {
    pidInput = relative_weight;
  }
}

void updateTemperature() {
  unsigned long currentMillis = millis();
  if (currentMillis - lastTempCheck >= TEMP_CHECK_INTERVAL) {
    lastTempCheck = currentMillis;
    
    // Request temperature from sensor
    tempSensor.requestTemperatures();
    
    // Read temperature
    currentTemp = tempSensor.getTempCByIndex(0);
    
    // Temperature reporting moved to reportWeights() function
  }
}

void updateMixerPID() {
  unsigned long currentMillis = millis();
  if (pidEnabled && (currentMillis - lastPIDUpdate >= PID_UPDATE_INTERVAL)) {
    lastPIDUpdate = currentMillis;
    
    // Compute new PID output
    if (mixerPID.Compute()) {
      // Update motor speed based on PID output
      setMixerSpeed((int)pidOutput);
      
      // Debug PID values
      Serial.print("PID (SP,IN,OUT): ");
      Serial.print(pidSetpoint);
      Serial.print(", ");
      Serial.print(pidInput);
      Serial.print(", ");
      Serial.println(pidOutput);
    }
    
    // Check if we've reached the target
    if (relative_weight >= pidSetpoint * 0.99) {  // Allow 1% tolerance
      stopMixerPID();
      Serial.println("PID target reached. Mixer stopped.");
    }
  }
}

void processCommand(String command) {
  command.trim(); // Remove any whitespace/newline
  Serial.print("Processing command: ");
  Serial.println(command);
  
  // Debug - print raw command received
  Serial.print("Raw command received: '");
  Serial.print(command);
  Serial.println("'");
  
  // First check for Python interface commands (format: COMMAND;param1=value1;param2=value2)
  if (command.indexOf(';') > 0) {
    // Command has parameters in Python interface format
    String cmd = command.substring(0, command.indexOf(';'));
    
    if (cmd == CMD_START) {
      // START command format: START;feeder=1;weight=100;speed=2
      int feederNum = getParamValue(command, "feeder").toInt();
      float targetWeight = getParamValue(command, "weight").toFloat();
      int speed = getParamValue(command, "speed").toInt();
      
      // Adjust motor speed based on speed parameter (1=slow, 2=normal, 3=fast)
      int adjustedSpeed = 150; // default speed
      if (speed == 1) adjustedSpeed = 100;      // slow
      else if (speed == 2) adjustedSpeed = 150; // normal
      else if (speed == 3) adjustedSpeed = 200; // fast
      
      // Process start command based on feeder number
      if (feederNum >= 1 && feederNum <= 7) {
        // Reset scale for this operation
        weight_offset = absolute_weight;
        relative_weight = 0;
        
        // Set target for the corresponding feeder
        target_weights[feederNum-1] = targetWeight;
        
        // Enable motor and set speed
        if (use_enable_pin) {
          digitalWrite(ENABLE_PIN, LOW); // Enable motors
        }
        
        switch (feederNum) {
          case 1: feeder1.setSpeed(MAX_SPEED); feeder_active[0] = true; break;
          case 2: feeder2.setSpeed(MAX_SPEED); feeder_active[1] = true; break;
          case 3: feeder3.setSpeed(MAX_SPEED); feeder_active[2] = true; break;
          case 4: feeder4.setSpeed(MAX_SPEED); feeder_active[3] = true; break;
          case 5: feeder5.setSpeed(MAX_SPEED); feeder_active[4] = true; break;
          case 6: feeder6.setSpeed(MAX_SPEED); feeder_active[5] = true; break;
          case 7: feeder7.setSpeed(MAX_SPEED); feeder_active[6] = true; break;
        }
        
        Serial.println("OK");
      } else {
        Serial.println("ERROR;Invalid feeder number");
      }
      return;
    }
    else if (cmd == CMD_STOP) {
      // STOP command format: STOP;feeder=1
      int feederNum = getParamValue(command, "feeder").toInt();
      
      if (feederNum >= 1 && feederNum <= 7) {
        stopFeeder(feederNum);
        Serial.println("OK");
      } else {
        Serial.println("ERROR;Invalid feeder number");
      }
      return;
    }
    else if (cmd == CMD_READ_WEIGHT) {
      // Return weight in format: WEIGHT;value=123.4
      Serial.print("WEIGHT;value=");
      Serial.println(absolute_weight, 1);
      return;
    }
    else if (cmd == CMD_TARE) {
      // Tare the scale
      scale.tare();
      weight_offset = 0;
      Serial.println("OK");
      return;
    }
    else if (cmd == CMD_CALIBRATE) {
      // CALIBRATE command format: CALIBRATE;weight=100
      float refWeight = getParamValue(command, "weight").toFloat();
      
      // Here you would implement calibration logic
      // This is simplified - normally you'd do a more complex calibration
      scale.set_scale(refWeight);
      Serial.println("OK");
      return;
    }
    else if (cmd == CMD_SET_SPEED) {
      // SET_SPEED command format: SET_SPEED;value=2
      int speed = getParamValue(command, "value").toInt();
      
      // Speed affects the MAX_SPEED constant
      // 1=slow, 2=normal, 3=fast
      // You'd implement logic to adjust speeds here
      Serial.println("OK");
      return;
    }
    else if (cmd == CMD_PING) {
      // Simple ping command to check connection
      Serial.println("OK;PONG");
      return;
    }
  }
  
  // If we reach here, process original command format
  // Feeder commands (feeder1+300, feeder2+500, etc.)
  if (command.startsWith("feeder1+")) {
    float target = command.substring(8).toFloat();
    startFeeder(1, target);
    Serial.println("Starting feeder 1"); // Debug output
  }
  else if (command.startsWith("feeder2+")) {
    float target = command.substring(8).toFloat();
    startFeeder(2, target);
  }
  else if (command.startsWith("feeder3+")) {
    float target = command.substring(8).toFloat();
    startFeeder(3, target);
  }
  else if (command.startsWith("feeder4+")) {
    float target = command.substring(8).toFloat();
    startFeeder(4, target);
  }
  else if (command.startsWith("feeder5+")) {
    float target = command.substring(8).toFloat();
    startFeeder(5, target);
  }
  else if (command.startsWith("feeder6+")) {
    float target = command.substring(8).toFloat();
    startFeeder(6, target);
  }
  else if (command.startsWith("feeder7+")) {
    float target = command.substring(8).toFloat();
    startFeeder(7, target);
  }
  // Mixer DC motor commands
  else if (command.startsWith("mixerspeed+")) {
    int speed = command.substring(11).toInt();
    setMixerSpeed(speed);
  } 
  else if (command == "mixerstop") {
    stopMixer();
  }
  else if (command.startsWith("wheat+")) {
    float target = command.substring(6).toFloat();
    startMixerPID(target);
  }
  else if (command == "wheatstop") {
    stopMixerPID();
  }
  else if (command.startsWith("tunepid+")) {
    // Format: tunepid+p,i,d (e.g., tunepid+10,0.2,0.1)
    String params = command.substring(8);
    int firstComma = params.indexOf(',');
    int secondComma = params.indexOf(',', firstComma + 1);
    
    if (firstComma > 0 && secondComma > 0) {
      double newKp = params.substring(0, firstComma).toDouble();
      double newKi = params.substring(firstComma + 1, secondComma).toDouble();
      double newKd = params.substring(secondComma + 1).toDouble();
      
      Kp = newKp;
      Ki = newKi;
      Kd = newKd;
      mixerPID.SetTunings(Kp, Ki, Kd);
      
      Serial.print("PID tunings updated to P=");
      Serial.print(Kp);
      Serial.print(" I=");
      Serial.print(Ki);
      Serial.print(" D=");
      Serial.println(Kd);
    }
  }
  // Water commands
  else if (command.startsWith("water+")) {
    float waterAmount = command.substring(6).toFloat();
    startWaterDispense(waterAmount);
  }
  else if (command.startsWith("settemp+")) {
    float tempValue = command.substring(8).toFloat();
    setTargetTemperature(tempValue);
  }
  else if (command == "stopwater") {
    stopWaterSystem();
  }
  // Relay commands
  else if (command == "mixeron") {
    digitalWrite(MIXER_RELAY_PIN, HIGH);
    Serial.println("Mixer relay turned ON");
  }
  else if (command == "mixeroff") {
    digitalWrite(MIXER_RELAY_PIN, LOW);
    Serial.println("Mixer relay turned OFF");
  }
  else if (command == "heatwater") {
    startWaterHeater();
  }
  else if (command == "heatwateroff") {
    stopWaterHeater();
  }
  else if (command == "watervalveon") {
    digitalWrite(WATER_VALVE_PIN, HIGH);
    Serial.println("Water valve opened");
  }
  else if (command == "watervalveoff") {
    digitalWrite(WATER_VALVE_PIN, LOW);
    Serial.println("Water valve closed");
  }
  // Enable/disable drivers command
  else if (command == "enabledrivers" && use_enable_pin) {
    digitalWrite(ENABLE_PIN, LOW);
    Serial.println("All stepper drivers enabled");
  }
  else if (command == "disabledrivers" && use_enable_pin) {
    digitalWrite(ENABLE_PIN, HIGH);
    Serial.println("All stepper drivers disabled");
  }
  // Tare commands
  else if (command == "tare") {
    // Tare both absolute and relative weights - full reset
    scale.tare();
    weight_offset = 0;
    Serial.println("Scale tared (absolute reset)");
  }
  else if (command == "tarerelative") {
    // Only tare the relative weight by setting the offset
    weight_offset = absolute_weight;
    Serial.println("Relative weight tared");
  }
  else {
    Serial.print("Unknown command: ");
    Serial.println(command);
  }
}

void setMixerSpeed(int speed) {
  // Constrain speed to valid PWM range
  speed = constrain(speed, 0, 255);
  
  if (speed == 0) {
    stopMixer();
  } else {
    // Set direction (forward only in this case)
    digitalWrite(MIXER_IN1_PIN, HIGH);
    digitalWrite(MIXER_IN2_PIN, LOW);
    
    // Set speed via PWM
    analogWrite(MIXER_ENA_PIN, speed);
    mixerSpeed = speed;
    mixerRunning = true;
    
    Serial.print("Mixer speed set to: ");
    Serial.println(speed);
  }
}

void stopMixer() {
  // Stop the motor
  analogWrite(MIXER_ENA_PIN, 0);
  digitalWrite(MIXER_IN1_PIN, LOW);
  digitalWrite(MIXER_IN2_PIN, LOW);
  
  mixerRunning = false;
  mixerSpeed = 0;
  
  Serial.println("Mixer stopped");
}

void startMixerPID(float targetWeight) {
  // Reset relative weight for this operation
  weight_offset = absolute_weight;
  relative_weight = 0;
  
  // Configure PID
  pidSetpoint = targetWeight;
  pidInput = 0;
  mixerPID.SetMode(AUTOMATIC);
  
  // Start PID control
  pidEnabled = true;
  
  Serial.print("PID wheat filling started. Target: ");
  Serial.print(targetWeight);
  Serial.println(" grams");
}

void stopMixerPID() {
  // Stop PID control
  pidEnabled = false;
  
  // Stop the mixer
  stopMixer();
  
  Serial.println("PID control stopped");
}

void startFeeder(int feederNum, float targetGrams) {
  Serial.print("Starting feeder ");
  Serial.print(feederNum);
  Serial.print(" to dispense ");
  Serial.print(targetGrams);
  Serial.println(" grams");
  
  AccelStepper* feeder;
  
  switch (feederNum) {
    case 1: feeder = &feeder1; break;
    case 2: feeder = &feeder2; break;
    case 3: feeder = &feeder3; break;
    case 4: feeder = &feeder4; break;
    case 5: feeder = &feeder5; break;
    case 6: feeder = &feeder6; break;
    case 7: feeder = &feeder7; break;
    default:
      Serial.println("Invalid feeder number");
      return;
  }
  
  // Before starting a new feeder operation, tare the relative weight
  weight_offset = absolute_weight;
  
  // Set target weight for this operation
  target_weights[feederNum-1] = targetGrams;
  
  // Enable motor if using enable pin
  if (use_enable_pin) {
    digitalWrite(ENABLE_PIN, LOW); // Enable the motors (LOW=enable, HIGH=disable for A4988)
    Serial.print("Enable pin set to LOW. Current state: ");
    Serial.println(digitalRead(ENABLE_PIN));
  }
  
  // Start at max speed 
  feeder->setSpeed(MAX_SPEED);
  feeder_active[feederNum-1] = true;
  
  // Debug stepper status
  Serial.print("Starting from: ");
  Serial.print(relative_weight);
  Serial.print(" g, Target: ");
  Serial.print(target_weights[feederNum-1]);
  Serial.print(" g, Speed: ");
  Serial.println(MAX_SPEED);
}

void checkFeeders() {
  for (int i = 0; i < 7; i++) {
    if (feeder_active[i]) {
      if (relative_weight >= target_weights[i]) {
        stopFeeder(i+1);
      } else {
        // Adjust feeder speed based on progress toward target
        int adjustedSpeed = calculateFeederSpeed(i);
        
        // Set the new speed and keep running
        switch (i+1) {
          case 1: 
            feeder1.setSpeed(adjustedSpeed); 
            feeder1.runSpeed(); 
            break;
          case 2: 
            feeder2.setSpeed(adjustedSpeed); 
            feeder2.runSpeed(); 
            break;
          case 3: 
            feeder3.setSpeed(adjustedSpeed); 
            feeder3.runSpeed(); 
            break;
          case 4: 
            feeder4.setSpeed(adjustedSpeed); 
            feeder4.runSpeed(); 
            break;
          case 5: 
            feeder5.setSpeed(adjustedSpeed); 
            feeder5.runSpeed(); 
            break;
          case 6: 
            feeder6.setSpeed(adjustedSpeed); 
            feeder6.runSpeed(); 
            break;
          case 7: 
            feeder7.setSpeed(adjustedSpeed); 
            feeder7.runSpeed(); 
            break;
        }
      }
    }
  }
}

// Calculate feeder speed based on how close we are to target weight
int calculateFeederSpeed(int feederIndex) {
  float target = target_weights[feederIndex];
  float progress = relative_weight / target;  // 0.0 to 1.0+ (ratio of current to target)
  int speed;
  
  // If we're past the first slow-down threshold
  if (progress >= SLOW_DOWN_THRESHOLD) {
    if (progress >= FINE_TUNE_THRESHOLD) {
      // Fine adjustment phase - very slow as we approach target
      float remaining = 1.0 - progress;  // How much is left (smaller number as we get closer)
      float speedRatio = remaining / (1.0 - FINE_TUNE_THRESHOLD);  // Map 0-0.05 to 0-1
      speed = MIN_SPEED + speedRatio * (MAX_SPEED - MIN_SPEED) * 0.3;  // Only use 30% of speed range
    } else {
      // Initial slow-down phase
      float speedRatio = (FINE_TUNE_THRESHOLD - progress) / (FINE_TUNE_THRESHOLD - SLOW_DOWN_THRESHOLD);
      speed = MIN_SPEED + speedRatio * (MAX_SPEED - MIN_SPEED);
    }
  } else {
    // Full speed until we reach slow-down threshold
    speed = MAX_SPEED;
  }
  
  // Ensure we don't go below minimum speed
  if (speed < MIN_SPEED) {
    speed = MIN_SPEED;
  }
  
  return speed;
}

void stopFeeder(int feederNum) {
  AccelStepper* feeder;
  
  switch (feederNum) {
    case 1: feeder = &feeder1; break;
    case 2: feeder = &feeder2; break;
    case 3: feeder = &feeder3; break;
    case 4: feeder = &feeder4; break;
    case 5: feeder = &feeder5; break;
    case 6: feeder = &feeder6; break;
    case 7: feeder = &feeder7; break;
    default:
      return;
  }
  
  // Stop the motor
  feeder->stop();
  feeder_active[feederNum-1] = false;
  
  // We only disable drivers if there are no more active feeders and we're using enable pin
  if (use_enable_pin) {
    bool any_active = false;
    for (int i = 0; i < 7; i++) {
      if (feeder_active[i]) {
        any_active = true;
        break;
      }
    }
    
    if (!any_active) {
      digitalWrite(ENABLE_PIN, HIGH); // Disable all motors when none are active
    }
  }
  
  Serial.print("Feeder ");
  Serial.print(feederNum);
  Serial.print(" stopped. Added ");
  Serial.print(relative_weight);
  Serial.print(" grams (target: ");
  Serial.print(target_weights[feederNum-1]);
  Serial.println(" grams)");
}

void startWaterDispense(float waterAmount) {
  Serial.print("Water dispense request: ");
  Serial.print(waterAmount);
  Serial.println(" grams");
  
  // Store the target amount
  targetWaterWeight = waterAmount;
  
  // Tare the scale for this water operation
  weight_offset = absolute_weight;
  relative_weight = 0;
  
  // Turn on the water heater first
  waterHeaterActive = true;
  waterDispenseRequested = true;
  digitalWrite(WATER_HEATER_PIN, HIGH);
  
  Serial.print("Water heater activated. Heating to target temperature: ");
  Serial.print(targetTemp);
  Serial.println("°C");
}

void checkWaterSystem() {
  // If water dispensing was requested
  if (waterDispenseRequested) {
    // Step 1: If heater is active, check if target temperature is reached
    if (waterHeaterActive && !waterPumpActive) {
      if (currentTemp >= targetTemp) {
        // Temperature reached, turn on the pump
        Serial.print("Target temperature reached: ");
        Serial.print(currentTemp);
        Serial.println("°C. Starting water pump.");
        
        waterHeaterActive = false;  // Temperature reached, heater no longer needed
        waterPumpActive = true;
        
        digitalWrite(WATER_HEATER_PIN, LOW);  // Turn off heater
        digitalWrite(WATER_PUMP_PIN, HIGH);   // Turn on pump
      }
    }
    
    // Step 2: If pump is active, check if target weight is reached
    if (waterPumpActive) {
      if (relative_weight >= targetWaterWeight) {
        // Target weight reached, stop the pump
        stopWaterSystem();
      }
    }
  }
}

void stopWaterSystem() {
  digitalWrite(WATER_HEATER_PIN, LOW);  // Turn off water heater
  digitalWrite(WATER_PUMP_PIN, LOW);    // Turn off water pump
  
  waterHeaterActive = false;
  waterPumpActive = false;
  waterDispenseRequested = false;
  
  Serial.print("Water system stopped. Added ");
  Serial.print(relative_weight);
  Serial.print(" grams (target: ");
  Serial.print(targetWaterWeight);
  Serial.println(" grams)");
}

void startWaterHeater() {
  digitalWrite(WATER_HEATER_PIN, HIGH);
  waterHeaterActive = true;
  Serial.print("Water heater turned ON. Heating to: ");
  Serial.print(targetTemp);
  Serial.println("°C");
}

void stopWaterHeater() {
  digitalWrite(WATER_HEATER_PIN, LOW);
  waterHeaterActive = false;
  Serial.println("Water heater turned OFF");
}

void setTargetTemperature(float temp) {
  targetTemp = temp;
  Serial.print("Water target temperature set to: ");
  Serial.print(targetTemp);
  Serial.println("°C");
}

void reportWeights() {
  // Report weights continuously
  static unsigned long lastReportTime = 0;
  if (millis() - lastReportTime > 100) { // Report 10 times per second
    // Report absolute weight (for Python interface)
    Serial.print("Weight:");
    Serial.println(absolute_weight, 1);
    
    // Report temperature continuously
    Serial.print("Temperature:");
    Serial.println(currentTemp, 1);
    
    // Report mixer status
    Serial.print("MixerSpeed:");
    Serial.println(mixerSpeed);
    
    // Optionally report relative weight for debugging
    // Comment out in production if not needed
    Serial.print("RelativeWeight:");
    Serial.println(relative_weight, 1);
    
    lastReportTime = millis();
  }
}

// Helper function to extract parameter values from Python interface commands
String getParamValue(String command, String paramName) {
  int paramStart = command.indexOf(paramName + "=");
  if (paramStart < 0) return "";
  
  paramStart += paramName.length() + 1; // Move past the "param="
  int paramEnd = command.indexOf(";", paramStart);
  
  if (paramEnd < 0) {
    // If no semicolon after, take the rest of the string
    return command.substring(paramStart);
  } else {
    return command.substring(paramStart, paramEnd);
  }
}
