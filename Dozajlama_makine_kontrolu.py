import sys
import csv
import os
import serial
import threading
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                            QHBoxLayout, QGridLayout, QPushButton, QLabel, 
                            QLineEdit, QComboBox, QTableWidget, QTableWidgetItem,
                            QFileDialog, QMessageBox, QTabWidget, QFrame, 
                            QScrollArea, QGroupBox, QSpinBox, QDoubleSpinBox, QDialog,
                            QHeaderView, QCheckBox, QInputDialog)
from PyQt5.QtCore import Qt, QTimer, pyqtSignal, QThread, QSize
from PyQt5.QtGui import QFont, QIcon, QColor

class LoadCellController(QThread):
    """Gerçek load cell ile haberleşen sınıf"""
    weight_updated = pyqtSignal(float, str)
    connection_status = pyqtSignal(bool, str)
    
    # Komut tipleri - Eski format (Referans için tutuluyor)
    CMD_START = "START"
    CMD_STOP = "STOP"
    CMD_CALIBRATE = "CALIBRATE"
    CMD_READ_WEIGHT = "READ_WEIGHT"
    CMD_TARE = "TARE"
    CMD_SET_SPEED = "SET_SPEED"
    CMD_PING = "PING"
    
    def __init__(self, parent=None):
        super().__init__(parent)
        self.running = True
        self.serial_port = None
        self.port_name = ""
        self.baud_rate = 115200  # 20_Mixer kullanıyor 115200 baud rate
        self.connected = False
        
        # Malzeme ağırlıkları
        self.current_weights = {}
        self.target_weights = {}
        self.active_ingredient = None
        
        # Feeder-malzeme eşleştirmeleri
        self.feeder_pins = {}  # Malzeme adı -> Feeder numarası
        
        # Bağlantı deneme sayacı
        self.connection_attempts = 0
        self.max_attempts = 3
        
        # Otomatik bağlantı denemesi yapma
        self.auto_connect = False
        
        # Dozajlama hızı (1: Yavaş, 2: Normal, 3: Hızlı)
        self.dosing_speed = 2
        
        # Heartbeat timer
        self.heartbeat_timer = QTimer()
        self.heartbeat_timer.timeout.connect(self.check_connection_heartbeat)
        self.heartbeat_timer.start(5000)  # 5 saniyede bir kontrol et
        
        # Mixer hızı
        self.mixer_speed = 0
        
        # Sıcaklık
        self.temperature = 0.0
    
    def set_port(self, port_name, baud_rate=115200):
        """Seri port ayarlarını belirle"""
        self.port_name = port_name
        self.baud_rate = baud_rate
    
    def connect_serial(self):
        """Seri porta bağlan"""
        if self.connected:
            return True
            
        try:
            self.serial_port = serial.Serial(
                port=self.port_name,
                baudrate=self.baud_rate,
                timeout=1,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE
            )
            self.connected = True
            self.connection_status.emit(True, f"Bağlantı başarılı: {self.port_name}")
            self.connection_attempts = 0
            
            # Bağlantı sonrası kısa bir bekleme
            self.msleep(100)
            
            # Bağlantı testi yap
            if not self.ping():
                self.connected = False
                self.connection_status.emit(False, f"Cihaz yanıt vermiyor: {self.port_name}")
                if self.serial_port and self.serial_port.is_open:
                    self.serial_port.close()
                return False
                
            return True
        except serial.SerialException as e:
            self.connection_attempts += 1
            self.connected = False
            self.connection_status.emit(False, f"Bağlantı hatası: {str(e)}")
            
            # Maksimum deneme sayısına ulaşıldı mı?
            if self.connection_attempts >= self.max_attempts:
                self.connection_status.emit(False, "Maksimum bağlantı deneme sayısına ulaşıldı!")
                
            return False
    
    def disconnect_serial(self):
        """Seri port bağlantısını kapat"""
        if self.serial_port and self.serial_port.is_open:
            self.serial_port.close()
        self.connected = False
        self.connection_status.emit(False, "Bağlantı kapatıldı")
    
    def set_target(self, ingredient, weight):
        """Hedef ağırlığı ayarla"""
        self.target_weights[ingredient] = weight
    
    def send_command(self, command, max_retries=2):
        """20_Mixer'a komut gönder
        
        Args:
            command (str): Gönderilecek komut
            max_retries (int): Maksimum yeniden deneme sayısı
        
        Returns:
            bool: Komut başarıyla gönderildiyse True
        """
        if not self.connected:
            if self.auto_connect and self.connect_serial():
                # Bağlantı başarılı, devam et
                pass
            else:
                return False
        
        retries = 0
        while retries <= max_retries:
            try:
                # Önce buffer'ı temizle
                self.serial_port.reset_input_buffer()
                self.serial_port.reset_output_buffer()
                
                # Komutu gönder
                print(f"Gönderilen komut: {command}")
                self.serial_port.write((command + "\n").encode())
                
                # Yanıt bekle (timeout süresi içinde)
                response = self.serial_port.readline().decode().strip()
                print(f"Alınan yanıt: {response}")
                
                # Yanıt boşsa tekrar dene
                if not response:
                    retries += 1
                    self.msleep(100)  # Kısa bir bekleme
                    continue
                
                # Yanıtı işle
                if response.startswith("OK") or response == "OK":
                    return True
                elif response.startswith("ERROR"):
                    error_msg = response.split(";")[1] if ";" in response else "Bilinmeyen hata"
                    self.connection_status.emit(False, f"Komut hatası: {error_msg}")
                    return False
                
                # WEIGHT yanıtları için özel işleme
                if response.startswith("WEIGHT"):
                    return response
                
                # Diğer yanıtlar
                if "Mixer speed set to" in response or "started. Target" in response:
                    return True
                
                # Tanınmayan yanıt
                self.connection_status.emit(False, f"Beklenmeyen yanıt: {response}")
                return False
                
            except serial.SerialTimeoutException:
                retries += 1
                self.msleep(100)  # Kısa bir bekleme
                
            except serial.SerialException as e:
                # Bağlantı kopmuş olabilir
                self.connected = False
                self.connection_status.emit(False, f"Bağlantı hatası: {str(e)}")
                
                # Otomatik yeniden bağlanma aktifse dene
                if self.auto_connect:
                    if self.connect_serial():
                        retries += 1
                        continue
                
                return False
        
        # Tüm denemeler başarısız
        self.connection_status.emit(False, f"Komut gönderme başarısız: Maksimum deneme sayısına ulaşıldı")
        return False
    
    def start_dosing(self, ingredient):
        """Dozajlamayı başlat"""
        if not self.connected and not self.connect_serial():
            return False
        
        # Malzeme için feeder numarasını bul
        feeder_num = self.feeder_pins.get(ingredient)
        if not feeder_num:
            self.connection_status.emit(False, f"{ingredient} için feeder atanmamış!")
            return False
        
        # Hedef ağırlığı al
        target_weight = self.target_weights.get(ingredient, 0.0)
        if target_weight <= 0:
            self.connection_status.emit(False, f"{ingredient} için hedef ağırlık belirtilmemiş!")
            return False
        
        # 20_Mixer ile uyumlu biçimde komutu oluştur
        # START;feeder=1;weight=100;speed=2
        command = f"{self.CMD_START};feeder={feeder_num};weight={target_weight};speed={self.dosing_speed}"
        
        # Python Interface formatında komut çalışmazsa, doğrudan 20_Mixer formatını kullan
        if not self.send_command(command):
            # 20_Mixer formatı: feeder1+100
            alternative_command = f"feeder{feeder_num}+{target_weight}"
            if self.send_command(alternative_command):
                self.active_ingredient = ingredient
                return True
            return False
        
        self.active_ingredient = ingredient
        return True
    
    def stop_dosing(self, ingredient=None):
        """Dozajlamayı durdur"""
        if not self.connected:
            return False
        
        if ingredient is None:
            ingredient = self.active_ingredient
        
        if not ingredient:
            return False
        
        # Malzeme için feeder numarasını bul
        feeder_num = self.feeder_pins.get(ingredient)
        if not feeder_num:
            return False
        
        # 20_Mixer ile uyumlu biçimde komutu oluştur
        # STOP;feeder=1
        command = f"{self.CMD_STOP};feeder={feeder_num}"
        
        # STOP komutu gönder
        result = self.send_command(command)
        
        # Python Interface formatında komut çalışmazsa, mixerstop komutunu dene
        if not result:
            result = self.send_command("mixerstop")
        
        if result:
            self.active_ingredient = None
        
        return result
    
    def read_weight(self):
        """Load cell'den ağırlık oku"""
        if not self.connected:
            if self.auto_connect and self.connect_serial():
                # Bağlantı başarılı, devam et
                pass
            else:
                return 0.0
        
        try:
            # 20_Mixer sürekli olarak ağırlık, sıcaklık ve mixer hızı değerlerini gönderiyor
            # Bu değerleri okuyup işleyeceğiz
            
            # Arduino'nun sürekli gönderdiği verilerden ağırlık bilgisini almak için
            # input buffer'ı okuyalım
            if self.serial_port.in_waiting > 0:
                for _ in range(min(10, self.serial_port.in_waiting)): # En fazla 10 satır oku
                    line = self.serial_port.readline().decode().strip()
                    
                    if line.startswith("Weight:"):
                        try:
                            weight = float(line.split(":")[1])
                            return weight
                        except (ValueError, IndexError):
                            pass
                    elif line.startswith("Temperature:"):
                        try:
                            self.temperature = float(line.split(":")[1])
                        except (ValueError, IndexError):
                            pass
                    elif line.startswith("MixerSpeed:"):
                        try:
                            self.mixer_speed = int(line.split(":")[1])
                        except (ValueError, IndexError):
                            pass
            
            # Eğer buffer'da ağırlık bilgisi bulamazsak, READ_WEIGHT komutu gönderelim
            response = self.send_command(self.CMD_READ_WEIGHT)
            
            if isinstance(response, str) and "WEIGHT;value=" in response:
                parts = response.split(";")
                for part in parts:
                    if part.startswith("value="):
                        try:
                            return float(part.split("=")[1])
                        except ValueError:
                            self.connection_status.emit(False, f"Geçersiz ağırlık değeri: {part}")
                            return 0.0
            
            return 0.0
            
        except serial.SerialException as e:
            self.connected = False
            self.connection_status.emit(False, f"Ağırlık okuma hatası: {str(e)}")
            return 0.0
    
    def get_temperature(self):
        """Sıcaklık değerini döndür"""
        return self.temperature
    
    def get_mixer_speed(self):
        """Mixer hızını döndür"""
        return self.mixer_speed
    
    def calibrate_load_cell(self, reference_weight=100.0):
        """Load cell kalibrasyonu"""
        if not self.connected:
            return False
        
        # 20_Mixer ile uyumlu biçimde komutu oluştur
        # CALIBRATE;weight=100
        command = f"{self.CMD_CALIBRATE};weight={reference_weight}"
        
        # Alternatif olarak 20_Mixer'ın özel fonksiyonları kullanılabilir
        if not self.send_command(command):
            return False
        
        return True
    
    def tare_load_cell(self):
        """Load cell sıfırlama"""
        if not self.connected:
            return False
        
        # 20_Mixer ile uyumlu biçimde komutu oluştur
        command = self.CMD_TARE
        
        # TARE komutu gönder, çalışmazsa 20_Mixer'ın kendi tare komutunu dene
        if not self.send_command(command):
            return self.send_command("tare")
        
        return True
    
    def tare_relative(self):
        """Load cell göreli sıfırlama"""
        if not self.connected:
            return False
        
        # 20_Mixer'ın kendi tarerelative komutunu kullan
        return self.send_command("tarerelative")
    
    def set_dosing_speed(self, speed):
        """Dozajlama hızını ayarla
        
        Args:
            speed (int): 1: Yavaş, 2: Normal, 3: Hızlı
        """
        if speed not in [1, 2, 3]:
            return False
        
        self.dosing_speed = speed
        
        if self.connected:
            # 20_Mixer ile uyumlu biçimde komutu oluştur
            # SET_SPEED;value=2
            command = f"{self.CMD_SET_SPEED};value={speed}"
            
            # Doğrudan 20_Mixer için mixer hızını ayarla
            if not self.send_command(command):
                # Alternatif komut: mixerspeed+150
                mixer_speeds = {1: 100, 2: 150, 3: 200}
                alternative_command = f"mixerspeed+{mixer_speeds[speed]}"
                return self.send_command(alternative_command)
        
        return True
    
    def set_feeder_number(self, ingredient, feeder_num):
        """Malzeme için feeder numarasını ayarla"""
        if not ingredient or feeder_num < 1 or feeder_num > 10:
            return False
        
        self.feeder_pins[ingredient] = feeder_num
        return True
    
    def ping(self):
        """Bağlantı kontrolü"""
        if not self.connected:
            return False
        
        # PING komutu gönder
        return self.send_command(self.CMD_PING)
    
    def set_mixer_speed(self, speed):
        """Mixer hızını ayarla (0-255)"""
        if not self.connected:
            return False
            
        # mixerspeed+150 formatında komut gönder
        command = f"mixerspeed+{speed}"
        return self.send_command(command)
    
    def stop_mixer(self):
        """Mikser motorunu durdur"""
        if not self.connected:
            return False
            
        return self.send_command("mixerstop")
    
    def set_temperature(self, temp):
        """Hedef sıcaklığı ayarla"""
        if not self.connected:
            return False
            
        command = f"settemp+{temp}"
        return self.send_command(command)
    
    def dispense_water(self, amount):
        """Su ekle"""
        if not self.connected:
            return False
            
        command = f"water+{amount}"
        return self.send_command(command)
    
    def stop_water(self):
        """Su sistemini durdur"""
        if not self.connected:
            return False
            
        return self.send_command("stopwater")
    
    def start_water_heater(self):
        """Su ısıtıcıyı başlat"""
        if not self.connected:
            return False
            
        return self.send_command("heatwater")
    
    def stop_water_heater(self):
        """Su ısıtıcıyı durdur"""
        if not self.connected:
            return False
            
        return self.send_command("heatwateroff")
    
    def set_feeder_pin(self, ingredient, pin):
        """Malzeme için feeder pin numarasını ayarla"""
        self.feeder_pins[ingredient] = pin
    
    def run(self):
        """Ana döngü"""
        while self.running:
            # Bağlı değilse ve otomatik bağlantı açıksa bağlanmayı dene
            if not self.connected and self.auto_connect:
                self.connect_serial()
                self.msleep(1000)  # 1 saniye bekle
                continue
                
            # Aktif malzeme varsa ağırlık oku
            if self.active_ingredient:
                weight = self.read_weight()
                
                # Ağırlığı güncelle
                self.current_weights[self.active_ingredient] = weight
                self.weight_updated.emit(weight, self.active_ingredient)
                
                # Hedef ağırlığa ulaşıldı mı?
                target = self.target_weights.get(self.active_ingredient, 0.0)
                if weight >= target:
                    self.stop_dosing()
            
            self.msleep(100)  # 100ms bekle
    
    def stop(self):
        """Thread'i durdur"""
        self.running = False
        self.disconnect_serial()
        self.wait()

    def check_connection_heartbeat(self):
        """Bağlantı durumunu periyodik olarak kontrol et"""
        if self.connected:
            # Ping komutu gönder
            if not self.ping():
                # Ping başarısız, bağlantı kopmuş olabilir
                self.connected = False
                self.connection_status.emit(False, "Bağlantı kaybedildi! Cihaz yanıt vermiyor.")
                
                # Otomatik yeniden bağlanma aktifse
                if self.auto_connect:
                    self.connect_serial()


class Recipe:
    """Reçete sınıfı"""
    def __init__(self, name="Yeni Reçete"):
        self.name = name
        self.ingredients = {
            "Un": 0.0,
            "Tuz": 0.0,
            "Şeker": 0.0,
            "Su": 0.0,
            "Maya": 0.0,
            "Yağ": 0.0,
            "Süt": 0.0,
            "Yumurta": 0.0,
            "Kakao": 0.0,
            "Kabartma Tozu": 0.0
        }
    
    def set_ingredient(self, name, amount):
        if name in self.ingredients:
            self.ingredients[name] = amount
        else:
            # Yeni malzeme eklenirse
            self.ingredients[name] = amount


class DosageApp(QMainWindow):
    """Ana uygulama sınıfı"""
    def __init__(self):
        super().__init__()
        self.recipes = []
        self.current_recipe = Recipe()
        
        # Load cell controller
        self.load_cell = LoadCellController()
        self.load_cell.weight_updated.connect(self.update_weight_display)
        self.load_cell.connection_status.connect(self.update_connection_status)
        
        # Varsayılan port ayarları
        self.available_ports = self.get_available_ports()
        if self.available_ports:
            self.load_cell.set_port(self.available_ports[0])
        
        self.load_cell.start()
        
        # Dokunmatik ekran için stil ayarları
        self.button_height = 60
        self.font_size = 14
        self.header_font_size = 16
        
        # Sıvı malzemeler listesi (otomatik pompalara atanacak)
        self.liquid_ingredients = ["Su", "Süt", "Yağ", "Zeytinyağı", "Sirke", "Limon Suyu"]
        
        # Feeder-malzeme eşleştirmeleri (sıvılar hariç)
        self.feeders = {
            "Feeder 1": "Un",
            "Feeder 2": "Tuz",
            "Feeder 3": "Şeker",
            "Feeder 4": "Maya",
            "Feeder 5": "Kabartma Tozu",
            "Feeder 6": "Kakao",
            "Feeder 7": "Tarçın",
            "Feeder 8": "Yumurta",
        }
        
        # Pompa-malzeme eşleştirmeleri (sıvılar için)
        self.pumps = {
            "Pompa 1": "Su",
            "Pompa 2": "Süt"
        }
        
        # Tüm malzemeler listesi
        self.all_ingredients = list(set(self.feeders.values()).union(set(self.pumps.values())))
        
        # Sıralı dozajlama için değişkenler
        self.sequential_dosing_active = False
        self.dosing_queue = []
        self.current_dosing_index = -1
        self.wait_time_between_dosing = 2000  # Varsayılan bekleme süresi (ms)
        self.wait_times = {}  # Her malzeme için özel bekleme süreleri
        
        # Durdurma/devam etme için değişkenler
        self.paused_dosing = False
        self.paused_dosing_index = -1
        
        # Dozajlama tamamlandığında sinyal bağlantısı
        self.load_cell.weight_updated.connect(self.check_sequential_dosing)
        
        self.init_ui()
    
    def get_available_ports(self):
        """Kullanılabilir seri portları listele ve aktif olanları işaretle"""
        try:
            import serial.tools.list_ports
            ports = []
            
            # Mevcut bağlantıyı kontrol et
            current_connected_port = None
            if self.load_cell.connected and self.load_cell.port_name:
                current_connected_port = self.load_cell.port_name
            
            for port in serial.tools.list_ports.comports():
                # Port bilgilerini ekle
                is_active = False
                
                # Aktif port kontrolü
                try:
                    # Eğer bu port zaten bağlıysa, tekrar açmaya çalışma
                    if current_connected_port and port.device == current_connected_port:
                        is_active = True
                        description = f"{port.device} - {port.description} [BAĞLI]"
                    else:
                        # Portu açmayı dene (bağlantı kurmadan)
                        test_port = serial.Serial(port.device, 9600, timeout=0.1)
                        test_port.close()
                        description = f"{port.device} - {port.description}"
                        
                except (serial.SerialException, OSError):
                    # Port meşgul veya erişilemez
                    description = f"{port.device} - {port.description} [MEŞGUL]"
                
                ports.append(description)
            
            return ports
        except Exception as e:
            print(f"Port listesi alınamadı: {str(e)}")
            return []

    def auto_detect_arduino_port(self):
        """Arduino'yu otomatik tespit etmeye çalış"""
        try:
            import serial.tools.list_ports
            
            # Arduino'ya ait olabilecek portları ara
            arduino_ports = []
            for port in serial.tools.list_ports.comports():
                # Arduino genellikle VID:PID değerleriyle tanınabilir
                # veya açıklamasında "Arduino" kelimesi geçer
                if "Arduino" in port.description or "VID:PID=2341" in port.hwid:
                    arduino_ports.append(port.device)
                # CH340 çipi kullanan Arduino klonları için
                elif "CH340" in port.description or "VID:PID=1A86:7523" in port.hwid:
                    arduino_ports.append(port.device)
                # FTDI çipi kullanan Arduino klonları için
                elif "FTDI" in port.description or "VID:PID=0403" in port.hwid:
                    arduino_ports.append(port.device)
            
            if arduino_ports:
                return arduino_ports[0]  # İlk bulunan Arduino portunu döndür
            
            return None
        except Exception as e:
            print(f"Arduino portu otomatik tespit edilemedi: {str(e)}")
            return None

    def test_port_connection(self, port_name):
        """Belirtilen porta bağlanmayı test et"""
        try:
            # Kısa timeout ile test bağlantısı
            test_serial = serial.Serial(port_name, self.load_cell.baud_rate, timeout=0.5)
            
            # Basit bir komut gönder (ping)
            test_serial.write(b"PING\n")
            
            # Yanıt bekle
            response = test_serial.readline().decode().strip()
            test_serial.close()
            
            # Yanıt kontrolü
            if response.startswith("OK") or "PING" in response:
                return True
            
            return False
        except Exception:
            return False
    
    def extract_port_name(self, port_description):
        """Port açıklamasından port adını çıkar"""
        # "COM3 - Arduino Uno" gibi bir açıklamadan "COM3" kısmını çıkar
        if " - " in port_description:
            return port_description.split(" - ")[0].strip()
        return port_description.strip()
    
    def update_connection_status(self, connected, message):
        """Bağlantı durumunu güncelle"""
        if connected:
            self.system_status.setText("Bağlı")
            self.system_status.setStyleSheet("color: #27ae60;")
        else:
            self.system_status.setText("Bağlantı Yok")
            self.system_status.setStyleSheet("color: #e74c3c;")
            
        # Durum mesajını göster - sadece kritik mesajlar için
        if "Maksimum bağlantı deneme sayısına ulaşıldı" in message or "Bağlantı başarılı" in message:
            QMessageBox.information(self, "Bağlantı Durumu", message)
    
    def init_ui(self):
        self.setWindowTitle("Dozajlama Makinesi Kontrolü")
        self.setGeometry(100, 100, 1024, 768)  # Daha büyük pencere
        
        # Ana widget ve layout
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        main_layout = QVBoxLayout(central_widget)
        main_layout.setSpacing(15)  # Öğeler arası boşluğu artır
        
        # Tab widget oluştur
        tabs = QTabWidget()
        tabs.setStyleSheet("""
            QTabWidget::pane { 
                border: 2px solid #3498db;
                border-radius: 6px;
                background-color: #f0f0f0;
            }
            QTabBar::tab {
                background-color: #d0d0d0;
                border: 1px solid #b0b0b0;
                padding: 15px 60px;  /* Yatay padding'i 30px'den 60px'e çıkardım */
                border-top-left-radius: 6px;
                border-top-right-radius: 6px;
                font-size: 16px;
                font-weight: bold;
                min-width: 200px;  /* Minimum genişliği belirledim */
            }
            QTabBar::tab:selected {
                background-color: #3498db;
                color: white;
            }
        """)
        main_layout.addWidget(tabs)
        
        # Ana kontrol sekmesi
        control_tab = QWidget()
        tabs.addTab(control_tab, "Dozajlama Kontrolü")
        
        # Reçete yönetimi sekmesi
        recipe_tab = QWidget()
        tabs.addTab(recipe_tab, "Reçete Yönetimi")
        
        # Ayarlar sekmesi
        settings_tab = QWidget()
        tabs.addTab(settings_tab, "Ayarlar")
        
        # Sekmelerin içeriğini oluştur
        self.setup_control_tab(control_tab)
        self.setup_recipe_tab(recipe_tab)
        self.setup_settings_tab(settings_tab)
    
    def create_styled_button(self, text, color="#3498db"):
        """Özel stillendirilmiş buton oluştur"""
        btn = QPushButton(text)
        btn.setMinimumHeight(self.button_height)
        btn.setMinimumWidth(250)  # Buton genişliğini 250 piksel olarak ayarla
        btn.setFont(QFont("Arial", self.font_size, QFont.Bold))
        btn.setStyleSheet(f"""
            QPushButton {{
                background-color: {color};
                color: white;
                border-radius: 8px;
                padding: 10px;
                padding-left: 15px;  /* Sol kenar boşluğunu artır */
                padding-right: 15px; /* Sağ kenar boşluğunu artır */
            }}
            QPushButton:hover {{
                background-color: {self.lighten_color(color)};
            }}
            QPushButton:pressed {{
                background-color: {self.darken_color(color)};
            }}
        """)
        return btn
    
    def lighten_color(self, color, factor=120):
        """Rengi açık ton yapar"""
        if color.startswith('#'):
            r = int(color[1:3], 16)
            g = int(color[3:5], 16)
            b = int(color[5:7], 16)
            
            r = min(255, r + factor)
            g = min(255, g + factor)
            b = min(255, b + factor)
            
            return f"#{r:02x}{g:02x}{b:02x}"
        return color
    
    def darken_color(self, color, factor=60):
        """Rengi koyu ton yapar"""
        if color.startswith('#'):
            r = int(color[1:3], 16)
            g = int(color[3:5], 16)
            b = int(color[5:7], 16)
            
            r = max(0, r - factor)
            g = max(0, g - factor)
            b = max(0, b - factor)
            
            return f"#{r:02x}{g:02x}{b:02x}"
        return color
    
    def setup_control_tab(self, tab):
        layout = QVBoxLayout(tab)
        layout.setSpacing(20)  # Öğeler arası boşluğu artır
        
        # Üst bilgi alanı
        info_frame = QFrame()
        info_frame.setFrameShape(QFrame.StyledPanel)
        info_frame.setStyleSheet("background-color: #e8f4fc; border-radius: 8px; padding: 10px;")
        info_layout = QHBoxLayout(info_frame)
        info_layout.setSpacing(15)
        
        # Aktif reçete bilgisi
        recipe_label = QLabel("Aktif Reçete:")
        recipe_label.setFont(QFont("Arial", self.font_size))
        self.active_recipe_name = QLabel("Seçilmedi")
        self.active_recipe_name.setFont(QFont("Arial", self.font_size, QFont.Bold))
        self.active_recipe_name.setStyleSheet("color: #2980b9;")
        
        info_layout.addWidget(recipe_label)
        info_layout.addWidget(self.active_recipe_name)
        info_layout.addStretch()
        
        # Mevcut sıcaklık ve durum bilgisi
        status_label = QLabel("Durum:")
        status_label.setFont(QFont("Arial", self.font_size))
        self.status_display = QLabel("Hazır")
        self.status_display.setFont(QFont("Arial", self.font_size, QFont.Bold))
        self.status_display.setStyleSheet("color: #27ae60;")
        
        temp_label = QLabel("Sıcaklık:")
        temp_label.setFont(QFont("Arial", self.font_size))
        self.temp_display = QLabel("0.0°C")
        self.temp_display.setFont(QFont("Arial", self.font_size, QFont.Bold))
        self.temp_display.setStyleSheet("color: #e67e22;")
        
        info_layout.addWidget(temp_label)
        info_layout.addWidget(self.temp_display)
        info_layout.addWidget(status_label)
        info_layout.addWidget(self.status_display)
        
        layout.addWidget(info_frame)
        
        # Malzeme dozajlama kontrolleri
        dosage_group = QGroupBox("Malzeme Dozajlama")
        dosage_group.setFont(QFont("Arial", self.header_font_size, QFont.Bold))
        dosage_group.setStyleSheet("""
            QGroupBox {
                border: 2px solid #3498db;
                border-radius: 8px;
                margin-top: 20px;
                padding-top: 30px;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                subcontrol-position: top center;
                padding: 0 10px;
                background-color: #3498db;
                color: white;
                border-radius: 5px;
            }
        """)
        
        # Scroll area ve kaydırma butonları için yatay layout
        scroll_layout = QHBoxLayout()
        
        # Scroll area ekle
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setStyleSheet("background: transparent; border: none;")
        
        self.dosage_widget = QWidget()
        self.dosage_layout = QGridLayout(self.dosage_widget)
        self.dosage_layout.setSpacing(15)
        self.dosage_layout.setVerticalSpacing(20)
        
        # Başlık satırı
        header_style = "font-weight: bold; font-size: 16px; color: #2c3e50; padding: 5px;"
        header_labels = ["Feeder", "Malzeme", "Hedef (g)", "Mevcut (g)", "Kontrol"]
        for i, header in enumerate(header_labels):
            label = QLabel(header)
            label.setFont(QFont("Arial", self.font_size, QFont.Bold))
            label.setStyleSheet(header_style)
            label.setAlignment(Qt.AlignCenter)
            self.dosage_layout.addWidget(label, 0, i)
        
        # Her malzeme için satır oluştur
        self.target_displays = {}
        self.current_displays = {}
        self.dosage_buttons = {}
        
        row = 1
        for feeder, ingredient in self.feeders.items():
            # Feeder adı
            feeder_label = QLabel(feeder)
            feeder_label.setFont(QFont("Arial", self.font_size))
            feeder_label.setAlignment(Qt.AlignCenter)
            self.dosage_layout.addWidget(feeder_label, row, 0)
            
            # Malzeme adı
            ing_label = QLabel(ingredient)
            ing_label.setFont(QFont("Arial", self.font_size))
            ing_label.setAlignment(Qt.AlignCenter)
            self.dosage_layout.addWidget(ing_label, row, 1)
            
            # Hedef değer
            target_display = QLabel("0.0")
            target_display.setFont(QFont("Arial", self.font_size, QFont.Bold))
            target_display.setStyleSheet("color: #2980b9;")
            target_display.setAlignment(Qt.AlignCenter)
            self.dosage_layout.addWidget(target_display, row, 2)
            self.target_displays[ingredient] = target_display
            
            # Mevcut değer
            current_display = QLabel("0.0")
            current_display.setFont(QFont("Arial", self.font_size))
            current_display.setAlignment(Qt.AlignCenter)
            self.dosage_layout.addWidget(current_display, row, 3)
            self.current_displays[ingredient] = current_display
            
            # Kontrol butonu
            dosage_button = self.create_styled_button("Başlat", "#2980b9")
            dosage_button.clicked.connect(lambda checked, ing=ingredient: self.start_dosing(ing))
            self.dosage_layout.addWidget(dosage_button, row, 4)
            self.dosage_buttons[ingredient] = dosage_button
            
            row += 1
        
        scroll.setWidget(self.dosage_widget)
        scroll_layout.addWidget(scroll)
        
        # Kaydırma butonlarını ekle
        self.add_scroll_buttons(scroll, scroll_layout)
        
        dosage_layout_main = QVBoxLayout(dosage_group)
        dosage_layout_main.addLayout(scroll_layout)  # scroll_layout'u ekle
        
        layout.addWidget(dosage_group)
        
        # Su ve Sıcaklık kontrolleri
        water_group = QGroupBox("Su ve Sıcaklık Kontrolleri")
        water_group.setFont(QFont("Arial", self.header_font_size, QFont.Bold))
        water_group.setStyleSheet("""
            QGroupBox {
                border: 2px solid #e67e22;
                border-radius: 8px;
                margin-top: 20px;
                padding-top: 30px;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                subcontrol-position: top center;
                padding: 0 10px;
                background-color: #e67e22;
                color: white;
                border-radius: 5px;
            }
        """)
        
        water_layout = QGridLayout(water_group)
        water_layout.setSpacing(15)
        
        # Su miktarı girişi
        water_label = QLabel("Su Miktarı (g):")
        water_label.setFont(QFont("Arial", self.font_size))
        water_layout.addWidget(water_label, 0, 0)
        
        self.water_amount = QDoubleSpinBox()
        self.water_amount.setRange(0, 5000)
        self.water_amount.setValue(500)
        self.water_amount.setSingleStep(10)
        self.water_amount.setDecimals(1)
        self.water_amount.setFont(QFont("Arial", self.font_size))
        self.water_amount.setMinimumHeight(45)
        self.water_amount.setStyleSheet("""
            QDoubleSpinBox {
                border: 2px solid #bdc3c7;
                border-radius: 6px;
                padding: 5px;
                background-color: white;
            }
            QDoubleSpinBox:focus {
                border: 2px solid #e67e22;
            }
        """)
        water_layout.addWidget(self.water_amount, 0, 1)
        
        # Su butonları
        water_add_btn = self.create_styled_button("Su Ekle", "#e67e22")
        water_add_btn.clicked.connect(self.dispense_water)
        water_layout.addWidget(water_add_btn, 0, 2)
        
        water_stop_btn = self.create_styled_button("Durdur", "#c0392b")
        water_stop_btn.clicked.connect(self.stop_water)
        water_layout.addWidget(water_stop_btn, 0, 3)
        
        # Sıcaklık ayarı
        temp_label = QLabel("Su Sıcaklığı (°C):")
        temp_label.setFont(QFont("Arial", self.font_size))
        water_layout.addWidget(temp_label, 1, 0)
        
        self.target_temp = QDoubleSpinBox()
        self.target_temp.setRange(20, 90)
        self.target_temp.setValue(35)
        self.target_temp.setSingleStep(1)
        self.target_temp.setDecimals(1)
        self.target_temp.setFont(QFont("Arial", self.font_size))
        self.target_temp.setMinimumHeight(45)
        self.target_temp.setStyleSheet("""
            QDoubleSpinBox {
                border: 2px solid #bdc3c7;
                border-radius: 6px;
                padding: 5px;
                background-color: white;
            }
            QDoubleSpinBox:focus {
                border: 2px solid #e67e22;
            }
        """)
        water_layout.addWidget(self.target_temp, 1, 1)
        
        # Sıcaklık butonları
        temp_set_btn = self.create_styled_button("Ayarla", "#e67e22")
        temp_set_btn.clicked.connect(self.set_temperature)
        water_layout.addWidget(temp_set_btn, 1, 2)
        
        heat_btn = self.create_styled_button("Isıt", "#d35400")
        heat_btn.clicked.connect(self.start_water_heater)
        water_layout.addWidget(heat_btn, 1, 3)
        
        # Mikser kontrolü
        mixer_label = QLabel("Mikser Hızı:")
        mixer_label.setFont(QFont("Arial", self.font_size))
        water_layout.addWidget(mixer_label, 2, 0)
        
        self.mixer_speed = QSpinBox()
        self.mixer_speed.setRange(0, 255)
        self.mixer_speed.setValue(150)
        self.mixer_speed.setFont(QFont("Arial", self.font_size))
        self.mixer_speed.setMinimumHeight(45)
        self.mixer_speed.setStyleSheet("""
            QSpinBox {
                border: 2px solid #bdc3c7;
                border-radius: 6px;
                padding: 5px;
                background-color: white;
            }
            QSpinBox:focus {
                border: 2px solid #e67e22;
            }
        """)
        water_layout.addWidget(self.mixer_speed, 2, 1)
        
        # Mikser butonları
        mixer_start_btn = self.create_styled_button("Başlat", "#3498db")
        mixer_start_btn.clicked.connect(self.start_mixer)
        water_layout.addWidget(mixer_start_btn, 2, 2)
        
        mixer_stop_btn = self.create_styled_button("Durdur", "#c0392b")
        mixer_stop_btn.clicked.connect(self.stop_mixer)
        water_layout.addWidget(mixer_stop_btn, 2, 3)
        
        layout.addWidget(water_group)
        
        # Feeder Ayarları Butonu
        feeder_btn = self.create_styled_button("Feeder ve Pompa Ayarları", "#f39c12")
        feeder_btn.clicked.connect(self.show_feeder_settings)
        layout.addWidget(feeder_btn)
        
        # Kontrol butonları
        control_layout = QHBoxLayout()
        control_layout.setSpacing(20)  # Butonlar arası boşluğu artır
        
        start_all_btn = self.create_styled_button("Tümünü Başlat", "#27ae60")
        start_all_btn.clicked.connect(self.start_all_dosing)
        
        stop_all_btn = self.create_styled_button("Tümünü Durdur", "#e74c3c")
        stop_all_btn.clicked.connect(self.stop_all_dosing)
        
        # Devam Et butonu
        resume_btn = self.create_styled_button("Devam Et", "#f39c12")
        resume_btn.clicked.connect(self.resume_dosing)
        
        # Sıralı dozajlama butonu
        sequential_btn = self.create_styled_button("Sıralı Dozajlama", "#8e44ad")
        sequential_btn.clicked.connect(self.start_sequential_dosing)
        
        control_layout.addWidget(start_all_btn)
        control_layout.addWidget(stop_all_btn)
        control_layout.addWidget(resume_btn)  # Yeni buton
        control_layout.addWidget(sequential_btn)
        
        layout.addLayout(control_layout)
        
        # Durum çubuğu
        status_frame = QFrame()
        status_frame.setFrameShape(QFrame.StyledPanel)
        status_frame.setStyleSheet("background-color: #f0f0f0; border-radius: 8px; padding: 10px;")
        status_layout = QHBoxLayout(status_frame)
        
        status_title = QLabel("Sistem Durumu:")
        status_title.setFont(QFont("Arial", self.font_size))
        status_layout.addWidget(status_title)
        
        self.system_status = QLabel("Çalışıyor")
        self.system_status.setFont(QFont("Arial", self.font_size, QFont.Bold))
        self.system_status.setStyleSheet("color: #27ae60;")
        status_layout.addWidget(self.system_status)
        status_layout.addStretch()
        
        layout.addWidget(status_frame)
    
    def dispense_water(self):
        """Su ekle"""
        amount = self.water_amount.value()
        if amount <= 0:
            QMessageBox.warning(self, "Uyarı", "Lütfen geçerli bir su miktarı girin!")
            return
        
        if self.load_cell.dispense_water(amount):
            self.status_display.setText(f"Su ekleniyor: {amount}g")
        else:
            QMessageBox.warning(self, "Hata", "Su eklenirken bir hata oluştu!")
    
    def stop_water(self):
        """Su sistemini durdur"""
        if self.load_cell.stop_water():
            self.status_display.setText("Su sistemi durduruldu")
        else:
            QMessageBox.warning(self, "Hata", "Su sistemi durdurulamadı!")
    
    def set_temperature(self):
        """Hedef sıcaklığı ayarla"""
        temp = self.target_temp.value()
        if self.load_cell.set_temperature(temp):
            self.status_display.setText(f"Hedef sıcaklık: {temp}°C")
        else:
            QMessageBox.warning(self, "Hata", "Sıcaklık ayarlanamadı!")
    
    def start_water_heater(self):
        """Su ısıtıcıyı başlat"""
        if self.load_cell.start_water_heater():
            self.status_display.setText("Su ısıtıcı çalıştırılıyor")
        else:
            QMessageBox.warning(self, "Hata", "Su ısıtıcı başlatılamadı!")
    
    def start_mixer(self):
        """Mikser motorunu başlat"""
        speed = self.mixer_speed.value()
        if self.load_cell.set_mixer_speed(speed):
            self.status_display.setText(f"Mikser çalışıyor: Hız {speed}")
        else:
            QMessageBox.warning(self, "Hata", "Mikser başlatılamadı!")
    
    def stop_mixer(self):
        """Mikser motorunu durdur"""
        if self.load_cell.stop_mixer():
            self.status_display.setText("Mikser durduruldu")
        else:
            QMessageBox.warning(self, "Hata", "Mikser durdurulamadı!")
    
    def setup_recipe_tab(self, tab):
        layout = QVBoxLayout(tab)
        layout.setSpacing(20)  # Öğeler arası boşluğu artır
        
    def update_weight_display(self, weight, ingredient):
        """Load cell'den gelen ağırlık değerini güncelle"""
        self.current_displays[ingredient].setText(f"{weight:.1f}")
        
        # Update temperature display
        temp = self.load_cell.get_temperature()
        self.temp_display.setText(f"{temp:.1f}°C")
        
        # Update mixer speed if available
        mixer_speed = self.load_cell.get_mixer_speed()
        if hasattr(self, 'mixer_speed_display'):
            self.mixer_speed_display.setText(f"{mixer_speed}")
        
        # Hedef değere ulaşıldıysa
        target = self.load_cell.target_weights[ingredient]
        if weight >= target and target > 0:
            self.dosage_buttons[ingredient].setText("Başlat")
            self.status_display.setText(f"{ingredient} dozajlama tamamlandı")
        